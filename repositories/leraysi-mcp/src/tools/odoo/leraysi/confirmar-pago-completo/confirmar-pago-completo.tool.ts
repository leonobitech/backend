import {
  confirmarPagoCompletoSchema,
  type ConfirmarPagoCompletoInput,
  type ConfirmarPagoCompletoResponse,
} from "./confirmar-pago-completo.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";
import { getTurnoConfirmadoEmailTemplate, getVendorNotificacionTemplate, type PagoInfo } from "@/prompts/email-templates";

/**
 * Tool consolidada para confirmar pago de turno en Estilos Leraysi
 *
 * Ejecuta todo el proceso post-pago en una sola llamada:
 * 1. Confirmar turno (estado=confirmado, sena_pagada=true)
 * 2. Obtener contacto del Lead (creado en Fase 1: Nuevo→Calificado), fallback: crear si no existe
 * 3. Actualizar tags y revenue del Lead
 * 4. Mover Lead a "Won" (Ganado)
 * 5. Crear evento en calendario
 * 6. Crear factura en account.move (módulo contabilidad Odoo)
 * 7. Generar PDF de factura (reporte nativo Odoo)
 * 8. Enviar email de confirmación con factura
 * 9. Retornar datos para WhatsApp
 */
export class ConfirmarPagoCompletoTool
  implements ITool<ConfirmarPagoCompletoInput, ConfirmarPagoCompletoResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<ConfirmarPagoCompletoResponse> {
    const params = confirmarPagoCompletoSchema.parse(input);

    logger.info(
      { turnoId: params.turno_id, mpPaymentId: params.mp_payment_id },
      "[ConfirmarPagoCompleto] Processing"
    );

    // =========================================================================
    // PASO 1: Obtener datos del turno y confirmar
    // =========================================================================
    const turnos = await this.odooClient.read("salon.turno", [params.turno_id], [
      "clienta",
      "telefono",
      "email",
      "servicio",
      "servicio_detalle",
      "fecha_hora",
      "duracion",
      "precio",
      "sena",
      "monto_pago_pendiente",
      "estado",
      "sena_pagada",
      "complejidad_maxima",
      "odoo_event_id",
      "total_pagado",
      "cantidad_pagos",
      "pago_ids",
    ]);

    if (turnos.length === 0) {
      throw new Error(`Turno #${params.turno_id} no encontrado`);
    }

    const turno = turnos[0];

    // Nombre legible del servicio para emails, WhatsApp, calendario, chatter
    // Prioridad: servicio_detalle > getServicioLabel(servicio) > código crudo
    const servicioDisplay = turno.servicio_detalle || this.getServicioLabel(turno.servicio) || turno.servicio;

    // Monto real pagado: usar monto_pago_pendiente (seteado por crear-turno o agregar-servicio)
    // Fallback a sena (computed = precio*0.30) si monto_pago_pendiente no está seteado
    const montoPagado = (turno.monto_pago_pendiente > 0) ? turno.monto_pago_pendiente : turno.sena;

    // Verificar que el turno no esté ya completado o cancelado
    if (turno.estado === "completado") {
      throw new Error(`El turno #${params.turno_id} ya está completado`);
    }
    if (turno.estado === "cancelado") {
      throw new Error(`El turno #${params.turno_id} está cancelado`);
    }

    // Confirmar el turno
    await this.odooClient.write("salon.turno", [params.turno_id], {
      estado: "confirmado",
      sena_pagada: true,
      mp_payment_id: params.mp_payment_id,
    });

    // =========================================================================
    // PASO 1a: FUSIÓN TURNO ADICIONAL — buscar hermanos confirmados del mismo lead
    // =========================================================================
    // Cuando se paga un turno adicional (otra trabajadora, fila separada en Odoo),
    // el CRM, calendario y emails deben reflejar TODOS los servicios combinados.
    // Buscamos otros turnos del mismo lead_id en estado "confirmado" para fusionar.
    let turnosHermanos: any[] = [];
    let servicioDisplayFusionado = servicioDisplay;
    let precioFusionado = turno.precio;
    let complejidadFusionada = turno.complejidad_maxima;
    let servicioDetalleFusionado = turno.servicio_detalle || servicioDisplay;
    let esTurnoConHermanos = false;

    try {
      const hermanos = await this.odooClient.search(
        "salon.turno",
        [
          ["lead_id", "=", params.lead_id],
          ["estado", "=", "confirmado"],
          ["id", "!=", params.turno_id],
        ],
        { fields: ["id", "servicio", "servicio_detalle", "precio", "complejidad_maxima", "fecha_hora", "duracion", "total_pagado", "sena", "monto_pago_pendiente", "odoo_event_id"] }
      );

      if (hermanos.length > 0) {
        turnosHermanos = hermanos;
        esTurnoConHermanos = true;

        // Fusionar servicio_detalle: "Manicura semipermanente" + "Pedicura"
        const todosDetalles: string[] = [];
        const todosServicios: string[] = [];
        let precioTotal = 0;
        let compMax = turno.complejidad_maxima || "media";

        // Agregar el turno actual
        todosDetalles.push(turno.servicio_detalle || this.getServicioLabel(turno.servicio) || turno.servicio);
        todosServicios.push(turno.servicio);
        precioTotal += turno.precio || 0;

        // Agregar cada hermano
        const COMP_ORDER: Record<string, number> = { simple: 1, media: 2, compleja: 3, muy_compleja: 4 };
        for (const h of hermanos) {
          const hDetalle = h.servicio_detalle || this.getServicioLabel(h.servicio) || h.servicio;
          todosDetalles.push(hDetalle);
          todosServicios.push(h.servicio);
          precioTotal += h.precio || 0;
          if ((COMP_ORDER[h.complejidad_maxima] || 0) > (COMP_ORDER[compMax] || 0)) {
            compMax = h.complejidad_maxima;
          }
        }

        servicioDetalleFusionado = todosDetalles.join(" + ");
        servicioDisplayFusionado = servicioDetalleFusionado;
        precioFusionado = precioTotal;
        complejidadFusionada = compMax;

        logger.info(
          { turnoId: params.turno_id, hermanos: hermanos.map((h: any) => h.id), servicioFusionado: servicioDetalleFusionado, precioFusionado },
          "[ConfirmarPagoCompleto] FUSIÓN: turno con hermanos confirmados del mismo lead"
        );
      }
    } catch (error) {
      logger.warn({ error }, "[ConfirmarPagoCompleto] Could not search for sibling turnos");
    }

    // ── Hora para la clienta (client-facing): si hay jornada completa, su hora prevalece ──
    // La clienta llega a las 09:00 para jornada completa, sin importar si es padre o hijo.
    // Baserow/Odoo mantienen la hora real del turno adicional (control interno).
    let fechaHoraClienteFacing = turno.fecha_hora;
    if (esTurnoConHermanos) {
      const allTurnos = [turno, ...turnosHermanos];
      const turnoJornada = allTurnos.find((t: any) => t.complejidad_maxima === "muy_compleja");
      if (turnoJornada) {
        fechaHoraClienteFacing = turnoJornada.fecha_hora;
      } else {
        // Sin jornada completa: la más temprana (hora de llegada)
        const todasFechas = allTurnos.map((t: any) => t.fecha_hora).sort();
        fechaHoraClienteFacing = todasFechas[0];
      }
    }

    // =========================================================================
    // PASO 1b: Leer historial de pagos (salon.turno.pago)
    // =========================================================================
    let pagosInfo: PagoInfo[] = [];
    let totalPagadoAcumulado: number = turno.total_pagado || 0;

    try {
      // Recolectar pago_ids de este turno + hermanos (si hay fusión)
      const allPagoIds: number[] = [...((turno.pago_ids as number[]) || [])];
      if (esTurnoConHermanos) {
        for (const h of turnosHermanos) {
          const hTurnos = await this.odooClient.read("salon.turno", [h.id], ["pago_ids"]);
          if (hTurnos.length > 0 && hTurnos[0].pago_ids) {
            allPagoIds.push(...(hTurnos[0].pago_ids as number[]));
          }
        }
      }

      if (allPagoIds.length > 0) {
        const pagosRaw = await this.odooClient.read("salon.turno.pago", allPagoIds, [
          "mp_payment_id",
          "monto",
          "tipo",
          "descripcion",
          "estado",
          "fecha",
        ]);

        // Filter approved, sort by fecha ASC
        pagosInfo = pagosRaw
          .filter((p: any) => p.estado === "approved")
          .sort((a: any, b: any) => (a.fecha || "").localeCompare(b.fecha || ""))
          .map((p: any) => ({
            mp_payment_id: p.mp_payment_id || "",
            monto: p.monto || 0,
            tipo: p.tipo || "sena",
            descripcion: p.descripcion || "",
          }));

        // Recalculate total from actual payments (all turnos combined)
        if (pagosInfo.length > 0) {
          totalPagadoAcumulado = pagosInfo.reduce((sum, p) => sum + p.monto, 0);
        }
      }
    } catch (error) {
      logger.warn({ error }, "[ConfirmarPagoCompleto] Could not read payment history");
    }

    // =========================================================================
    // PASO 2: Obtener contacto del Lead (creado en Fase 1: Nuevo→Calificado)
    // Fallback: buscar por email/teléfono o crear si no existe
    // =========================================================================
    const emailToUse = params.email_override || turno.email;
    let partnerId: number | null = null;

    // Primero: leer partner_id del lead (ya debería existir desde Fase 1)
    try {
      const leadData = await this.odooClient.read("crm.lead", [params.lead_id], ["partner_id"]);
      if (leadData.length > 0 && leadData[0].partner_id && Array.isArray(leadData[0].partner_id)) {
        partnerId = leadData[0].partner_id[0];
      }
    } catch (error) {
      logger.warn({ error }, "[ConfirmarPagoCompleto] Could not read partner_id from lead");
    }

    // Fallback: buscar contacto por email o teléfono
    if (!partnerId && emailToUse) {
      const existingPartners = await this.odooClient.search(
        "res.partner",
        [["email", "=", emailToUse]],
        { fields: ["id"], limit: 1 }
      );
      if (existingPartners.length > 0) {
        partnerId = existingPartners[0].id;
      }
    }

    if (!partnerId && turno.telefono) {
      const existingPartners = await this.odooClient.search(
        "res.partner",
        [["phone", "=", turno.telefono]],
        { fields: ["id"], limit: 1 }
      );
      if (existingPartners.length > 0) {
        partnerId = existingPartners[0].id;
      }
    }

    // Último recurso: crear contacto
    if (!partnerId) {
      const partnerData: Record<string, any> = {
        name: turno.clienta,
        is_company: false,
        phone: turno.telefono,
      };
      if (emailToUse) partnerData.email = emailToUse;

      partnerId = await this.odooClient.create("res.partner", partnerData);
      logger.info({ partnerId }, "[ConfirmarPagoCompleto] Created contact as fallback (Fase 1 may have failed)");
    }

    // =========================================================================
    // PASO 3: Vincular contacto al Lead
    // =========================================================================
    // Resolver tags CRM: usar datos FUSIONADOS (todos los servicios del lead)
    // servicioDetalleFusionado ya tiene "Servicio A + Servicio B" cuando hay hermanos
    const tagIds = await this.resolveLeadTags(
      turno.servicio,
      complejidadFusionada,
      esTurnoConHermanos ? servicioDetalleFusionado : turno.servicio_detalle
    );

    // Cuando hay fusión: REPLACE todos los tags (no append) para reflejar estado completo
    // Cuando es turno solo: append nuevos + reemplazar complejidad (comportamiento original)
    const complexityNames = ["Simple", "Media", "Compleja", "Muy Compleja"];
    let tagCommands: any[];

    if (esTurnoConHermanos) {
      // REPLACE servicio + complejidad, pero PRESERVAR tags existentes (canal, etc.)
      try {
        const leadData = await this.odooClient.read("crm.lead", [params.lead_id], ["tag_ids"]);
        if (leadData.length > 0 && leadData[0].tag_ids?.length > 0) {
          // Obtener nombres de tags de servicio y complejidad para identificarlos
          const servicioComplejidadTags = await this.odooClient.search(
            "crm.tag",
            [["id", "in", leadData[0].tag_ids], ["name", "in", complexityNames]],
            { fields: ["id"] }
          );
          const servicioComplejidadIds = new Set(servicioComplejidadTags.map((t: any) => t.id));
          // Tags a preservar = existentes - (complejidad vieja) + nuevos fusionados
          const preservedTagIds = leadData[0].tag_ids.filter((id: number) => !servicioComplejidadIds.has(id));
          const allTagIds = [...new Set([...preservedTagIds, ...tagIds])];
          tagCommands = [[6, 0, allTagIds]];
        } else {
          tagCommands = [[6, 0, tagIds]];
        }
      } catch (error) {
        logger.warn({ error }, "[ConfirmarPagoCompleto] Could not read existing lead tags for merge");
        tagCommands = [[6, 0, tagIds]];
      }
    } else {
      // APPEND + reemplazar complejidad (comportamiento original para turno standalone)
      tagCommands = tagIds.map((id: number) => [4, id]);

      try {
        const leadData = await this.odooClient.read("crm.lead", [params.lead_id], ["tag_ids"]);
        if (leadData.length > 0 && leadData[0].tag_ids?.length > 0) {
          const existingComplexityTags = await this.odooClient.search(
            "crm.tag",
            [["id", "in", leadData[0].tag_ids], ["name", "in", complexityNames]],
            { fields: ["id"] }
          );
          const unlinkCommands = existingComplexityTags.map((t: any) => [3, t.id]);
          tagCommands = [...unlinkCommands, ...tagCommands];
        }
      } catch (error) {
        logger.warn({ error }, "[ConfirmarPagoCompleto] Could not read existing lead tags");
      }
    }

    await this.odooClient.write("crm.lead", [params.lead_id], {
      partner_id: partnerId,
      expected_revenue: precioFusionado,
      tag_ids: tagCommands,
    });

    // Registrar en el chatter del Lead
    const chatterServicio = esTurnoConHermanos ? servicioDisplayFusionado : servicioDisplay;
    await this.odooClient.postMessageToChatter({
      model: "crm.lead",
      resId: params.lead_id,
      body: `
        <p><strong>Pago de seña confirmado${esTurnoConHermanos ? " (servicio adicional)" : ""}</strong></p>
        <ul>
          <li><strong>Clienta:</strong> ${turno.clienta}</li>
          <li><strong>Servicios:</strong> ${chatterServicio}</li>
          <li><strong>Monto pagado:</strong> $${montoPagado.toLocaleString()}</li>
          <li><strong>Precio total combinado:</strong> $${precioFusionado.toLocaleString()}</li>
          <li><strong>MP Payment ID:</strong> ${params.mp_payment_id}</li>
        </ul>
        <p>Contacto vinculado automáticamente.</p>
        <p><em>Sistema automatizado Leonobitech</em></p>
      `,
      messageType: "comment",
    });

    // =========================================================================
    // PASO 4: Mover Lead a "Won" (Ganado)
    // =========================================================================
    try {
      await this.odooClient.updateDealStage(params.lead_id, "Won");
    } catch (error) {
      logger.warn({ error }, "[ConfirmarPagoCompleto] Could not move Lead to Won");
    }

    // =========================================================================
    // PASO 5: Crear evento en calendario
    // =========================================================================
    let eventId: number | null = null;
    let activityId: number | null = null;

    try {
      // turno.fecha_hora ya está en UTC (convertido al crear el turno)
      // Odoo Calendar espera UTC, usamos directamente
      const startUTC = turno.fecha_hora;
      const stopUTC = this.addHoursToOdooDatetime(startUTC, turno.duracion || 1);

      // Obtener partner_id y user_id del Lead (igual que scheduleMeeting)
      const leads = await this.odooClient.read("crm.lead", [params.lead_id], ["partner_id", "user_id"]);

      if (leads.length === 0) {
        throw new Error(`Lead #${params.lead_id} not found`);
      }

      const lead = leads[0];
      const eventPartnerIds: number[] = [];

      // Agregar el partner del Lead (cliente) como asistente
      if (lead.partner_id && Array.isArray(lead.partner_id) && lead.partner_id[0]) {
        eventPartnerIds.push(lead.partner_id[0]);
      }

      // Obtener user_id del Lead (o asignar el usuario del servicio si no tiene)
      let effectiveUserId = lead.user_id && Array.isArray(lead.user_id) ? lead.user_id[0] : undefined;

      if (!effectiveUserId) {
        // El Lead no tiene salesperson asignado - usar el usuario del servicio
        effectiveUserId = await this.odooClient.getUid();
        await this.odooClient.write("crm.lead", [params.lead_id], {
          user_id: effectiveUserId
        });
      }

      // Agregar el partner del vendedor como asistente (esto hace que aparezca en su calendario)
      const users = await this.odooClient.read("res.users", [effectiveUserId], ["partner_id"]);
      if (users.length > 0 && users[0].partner_id && Array.isArray(users[0].partner_id)) {
        eventPartnerIds.push(users[0].partner_id[0]);
      }

      // Usar datos fusionados para nombre y descripción del evento
      const calServicio = esTurnoConHermanos ? servicioDisplayFusionado : servicioDisplay;
      const calPrecio = esTurnoConHermanos ? precioFusionado : turno.precio;

      const eventValues: Record<string, any> = {
        name: `Turno: ${calServicio} - ${turno.clienta}`,
        start: startUTC,
        stop: stopUTC,
        duration: turno.duracion || 1,
        description: `Servicio: ${calServicio}\nClienta: ${turno.clienta}\nTeléfono: ${turno.telefono}\nPrecio total: $${calPrecio}\nSeña pagada: $${montoPagado}\nTotal pagado: $${totalPagadoAcumulado}`,
        location: "Yerbal 513, CABA",
        partner_ids: [[6, 0, eventPartnerIds]],
        opportunity_id: params.lead_id,
        user_id: effectiveUserId,
      };

      // Verificar si ya existe un evento de calendario para este turno
      const existingEventId = turno.odoo_event_id as number;

      if (esTurnoConHermanos) {
        // ── TURNO CON HERMANOS: un solo evento por clienta ──
        // Reutilizar evento existente del hermano. Actualizar título/descripción.
        // Si hay jornada completa (muy_compleja), sus horarios prevalecen en el evento.
        const hermanoConEvento = turnosHermanos.find((h: any) => h.odoo_event_id);
        const hermanoEventId = hermanoConEvento?.odoo_event_id as number;
        const currentEsJornada = turno.complejidad_maxima === "muy_compleja";

        if (hermanoEventId) {
          try {
            const eventUpdateData: Record<string, any> = {
              name: `Turno: ${calServicio} - ${turno.clienta}`,
              description: `Servicios: ${calServicio}\nClienta: ${turno.clienta}\nTeléfono: ${turno.telefono}\nPrecio total: $${calPrecio}\nSeña total pagada: $${totalPagadoAcumulado}`,
              location: "Yerbal 513, CABA",
            };

            // Si el turno actual es jornada completa y el evento pertenece a un hermano
            // no-jornada, actualizar también start/stop/duration para reflejar 09:00-19:00
            if (currentEsJornada) {
              eventUpdateData.start = startUTC;
              eventUpdateData.stop = stopUTC;
              eventUpdateData.duration = turno.duracion || 1;
            }

            await this.odooClient.write("calendar.event", [hermanoEventId], eventUpdateData, { mail_notrack: true });

            // Ambos turnos apuntan al mismo evento de calendario
            await this.odooClient.write("salon.turno", [params.turno_id], { odoo_event_id: hermanoEventId });
            eventId = hermanoEventId;

            logger.info(
              { eventId: hermanoEventId, turnoId: params.turno_id, hermanoId: hermanoConEvento.id, updatedTimes: currentEsJornada },
              "[ConfirmarPagoCompleto] Turno con hermanos: updated calendar event (single event per client)"
            );
          } catch (updateError) {
            // Fallback: crear evento nuevo con datos fusionados
            logger.warn({ updateError, hermanoEventId }, "[ConfirmarPagoCompleto] Could not update sibling event, creating new");
            eventId = await this.odooClient.create("calendar.event", eventValues);
            await this.odooClient.write("salon.turno", [params.turno_id], { odoo_event_id: eventId });
          }
        } else {
          // Hermano sin evento de calendario → crear nuevo con datos fusionados
          eventId = await this.odooClient.create("calendar.event", eventValues);
          await this.odooClient.write("salon.turno", [params.turno_id], { odoo_event_id: eventId });
          logger.info(
            { eventId, turnoId: params.turno_id },
            "[ConfirmarPagoCompleto] Turno con hermanos: no sibling event, created new with fused data"
          );
        }
        // NO crear actividad para turno adicional (ya existe la del hermano)

      } else if (existingEventId) {
        // ── TURNO NORMAL con evento existente: ACTUALIZAR ──
        // NO re-enviar partner_ids para evitar invitaciones duplicadas.
        try {
          const { partner_ids, ...updateValues } = eventValues;
          await this.odooClient.write("calendar.event", [existingEventId], updateValues, { mail_notrack: true });
          eventId = existingEventId;
          logger.info(
            { eventId, turnoId: params.turno_id },
            "[ConfirmarPagoCompleto] Updated existing calendar event"
          );
        } catch (updateError) {
          logger.warn({ updateError, existingEventId }, "[ConfirmarPagoCompleto] Could not update event, creating new");
          eventId = await this.odooClient.create("calendar.event", eventValues);
          await this.odooClient.write("salon.turno", [params.turno_id], { odoo_event_id: eventId });
        }
      } else {
        // ── TURNO NORMAL sin evento: CREAR ──
        eventId = await this.odooClient.create("calendar.event", eventValues);
        await this.odooClient.write("salon.turno", [params.turno_id], { odoo_event_id: eventId });
        logger.info(
          { eventId, turnoId: params.turno_id },
          "[ConfirmarPagoCompleto] Created new calendar event and stored ID"
        );
      }

      // Crear actividad vinculada (solo para turnos normales con evento nuevo)
      if (!existingEventId && !esTurnoConHermanos) {
        const deadlineDate = turno.fecha_hora.split(" ")[0];
        activityId = await this.odooClient.createActivity({
          activityType: "meeting",
          summary: `Turno: ${calServicio} - ${turno.clienta}`,
          resModel: "crm.lead",
          resId: params.lead_id,
          dateDeadline: deadlineDate,
          userId: effectiveUserId,
          note: `Turno confirmado para ${turno.clienta}`,
          calendarEventId: eventId,
        });
      }
    } catch (error) {
      logger.warn({ error }, "[ConfirmarPagoCompleto] Could not create calendar event/activity");
    }

    // =========================================================================
    // PASO 5b: Obtener URL de confirmación de asistencia del calendario
    // =========================================================================
    let calendarAcceptUrl: string | null = null;
    try {
      if (eventId && partnerId) {
        const attendees = await this.odooClient.search("calendar.attendee", [
          ["event_id", "=", eventId],
          ["partner_id", "=", partnerId],
        ], { fields: ["access_token"], limit: 1 });

        if (attendees.length > 0 && attendees[0].access_token) {
          const baseUrl = await this.odooClient.execute(
            "ir.config_parameter", "get_param", ["web.base.url"]
          );
          calendarAcceptUrl = `${baseUrl}/calendar/meeting/accept?token=${attendees[0].access_token}&id=${eventId}`;
          logger.info({ calendarAcceptUrl }, "[ConfirmarPagoCompleto] Calendar accept URL generated");
        }
      }
    } catch (error) {
      logger.warn({ error }, "[ConfirmarPagoCompleto] Could not get calendar accept URL");
    }

    // =========================================================================
    // PASO 6: Crear o actualizar factura en account.move (módulo contabilidad Odoo)
    // Si existe una factura borrador para este turno, agregar línea en vez de crear nueva
    // =========================================================================
    let invoiceId: number | null = null;
    let invoiceName: string | null = null;
    let invoicePdfBase64: string | null = null;
    let invoiceAction: "created" | "updated" | null = null;

    try {
      // Obtener cuenta de ingresos por defecto
      const incomeAccounts = await this.odooClient.search(
        "account.account",
        [["account_type", "=", "income"]],
        { fields: ["id"], limit: 1 }
      );

      const accountId = incomeAccounts.length > 0 ? incomeAccounts[0].id : null;

      // Obtener journal de ventas
      const salesJournals = await this.odooClient.search(
        "account.journal",
        [["type", "=", "sale"]],
        { fields: ["id"], limit: 1 }
      );

      const journalId = salesJournals.length > 0 ? salesJournals[0].id : null;

      if (!journalId) {
        logger.warn("[ConfirmarPagoCompleto] No sales journal found, skipping invoice creation");
      } else {
        const invoiceDate = new Date().toISOString().split("T")[0];
        const servicioLabel = esTurnoConHermanos ? servicioDisplayFusionado : servicioDisplay;

        // Buscar factura borrador existente: primero este turno, luego hermanos
        let existingInvoices = await this.odooClient.search(
          "account.move",
          [
            ["move_type", "=", "out_invoice"],
            ["partner_id", "=", partnerId],
            ["state", "=", "draft"],
            ["invoice_origin", "ilike", `Turno #${params.turno_id}`],
          ],
          { fields: ["id", "name", "narration"], limit: 1 }
        );

        // FUSIÓN: Si no hay factura propia pero hay hermanos, buscar factura del hermano
        if (existingInvoices.length === 0 && esTurnoConHermanos) {
          for (const h of turnosHermanos) {
            const hInvoices = await this.odooClient.search(
              "account.move",
              [
                ["move_type", "=", "out_invoice"],
                ["partner_id", "=", partnerId],
                ["state", "=", "draft"],
                ["invoice_origin", "ilike", `Turno #${h.id}`],
              ],
              { fields: ["id", "name", "narration"], limit: 1 }
            );
            if (hInvoices.length > 0) {
              existingInvoices = hInvoices;
              logger.info(
                { siblingInvoiceId: hInvoices[0].id, hermanoId: h.id },
                "[ConfirmarPagoCompleto] Found sibling's draft invoice, will add line"
              );
              break;
            }
          }
        }

        if (existingInvoices.length > 0) {
          // ===== AGREGAR LÍNEA A FACTURA EXISTENTE =====
          invoiceId = existingInvoices[0].id;
          invoiceAction = "updated";

          logger.info(
            { invoiceId, turnoId: params.turno_id },
            "[ConfirmarPagoCompleto] Found existing draft invoice, adding line"
          );

          const invoiceLineValues: any = {
            move_id: invoiceId,
            name: `Seña adicional - ${servicioLabel} - Turno #${params.turno_id}`,
            quantity: 1,
            price_unit: montoPagado,
          };

          if (accountId) {
            invoiceLineValues.account_id = accountId;
          }

          // Crear línea de factura
          await this.odooClient.create("account.move.line", invoiceLineValues);

          // Actualizar narration con info del nuevo pago
          const existingNarration = existingInvoices[0].narration || "";
          const newNarration = `${existingNarration}\n---\nSeña adicional por servicio agregado: ${servicioLabel}\nPago MercadoPago ID: ${params.mp_payment_id}`;

          await this.odooClient.write("account.move", [invoiceId!], {
            narration: newNarration,
            invoice_origin: `Turno #${params.turno_id} - MP: ${params.mp_payment_id}`,
          });

        } else {
          // ===== CREAR NUEVA FACTURA =====
          invoiceAction = "created";

          const invoiceLineValues: any = {
            name: `Seña - ${servicioLabel} - Turno #${params.turno_id}`,
            quantity: 1,
            price_unit: montoPagado,
          };

          if (accountId) {
            invoiceLineValues.account_id = accountId;
          }

          const invoiceValues: Record<string, any> = {
            move_type: "out_invoice",
            partner_id: partnerId,
            journal_id: journalId,
            invoice_date: invoiceDate,
            invoice_origin: `Turno #${params.turno_id} - MP: ${params.mp_payment_id}`,
            narration: `Seña por servicio de ${servicioLabel} para ${turno.clienta}\nFecha del turno: ${turno.fecha_hora}\nPago MercadoPago ID: ${params.mp_payment_id}`,
            invoice_line_ids: [[0, 0, invoiceLineValues]],
          };

          invoiceId = await this.odooClient.create("account.move", invoiceValues);
        }

        // NO publicar automáticamente - dejar como borrador para permitir agregar más líneas
        // La publicación se hará manualmente o cuando el turno se complete
        logger.info(
          { invoiceId, action: invoiceAction },
          "[ConfirmarPagoCompleto] Invoice left as draft for potential additions"
        );

        // Obtener nombre/número de factura
        if (invoiceId) {
          const invoices = await this.odooClient.read("account.move", [invoiceId], ["name"]);
          if (invoices.length > 0) {
            invoiceName = invoices[0].name;
          }
        }

        // Generar PDF usando método público wrapper (XML-RPC no puede llamar _render_qweb_pdf)
        if (invoiceId) {
          try {
            const reportResult = await this.odooClient.execute(
              "salon.turno",
              "render_invoice_pdf",
              [[params.turno_id], "account.account_invoices", [invoiceId]],
              {}
            );

            if (reportResult && reportResult[0]) {
              invoicePdfBase64 = reportResult[0]; // Ya viene en base64 desde el método Odoo
            }
          } catch (pdfError) {
            logger.warn({ pdfError }, "[ConfirmarPagoCompleto] Could not generate invoice PDF");
          }
        }
      }
    } catch (error) {
      logger.warn({ error }, "[ConfirmarPagoCompleto] Could not create/update invoice in account.move");
    }

    // =========================================================================
    // PASO 7: Enviar email de confirmación
    // =========================================================================
    if (emailToUse) {
      try {
        // turno.fecha_hora viene en UTC desde Odoo API, convertir a Argentina para mostrar
        // Para turno con hermanos: usar fechaHoraClienteFacing (jornada completa prevalece)
        const fechaHoraArgentina = this.utcToArgentinaDate(esTurnoConHermanos ? fechaHoraClienteFacing : turno.fecha_hora);
        const fechaFormateada = fechaHoraArgentina.toLocaleDateString("es-AR", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        });
        const horaFormateada = fechaHoraArgentina.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        });

        // Usar datos fusionados en email cuando hay hermanos
        const emailServicio = esTurnoConHermanos ? servicioDisplayFusionado : servicioDisplay;
        const emailServicioDetalle = esTurnoConHermanos ? servicioDetalleFusionado : turno.servicio_detalle;
        const emailPrecio = esTurnoConHermanos ? precioFusionado : turno.precio;

        const emailHtml = getTurnoConfirmadoEmailTemplate({
          clienta: turno.clienta,
          servicio: emailServicio,
          servicio_detalle: emailServicioDetalle,
          fecha: fechaFormateada,
          hora: horaFormateada,
          precio: emailPrecio,
          sena: montoPagado,
          monto_restante: emailPrecio - totalPagadoAcumulado,
          mp_payment_id: params.mp_payment_id,
          direccion: "Yerbal 513, Caballito, Buenos Aires - Argentina",
          // Detailed payment breakdown (includes all sibling payments when fused)
          pagos: pagosInfo.length > 0 ? pagosInfo : undefined,
          total_pagado_acumulado: totalPagadoAcumulado,
          pago_actual_mp_id: params.mp_payment_id,
        });

        // Crear email con adjunto
        const mailValues: Record<string, any> = {
          subject: `Turno Confirmado - Estilos Leraysi${invoiceName ? ` - ${invoiceName}` : ""}`,
          body_html: emailHtml,
          email_to: emailToUse,
          auto_delete: false,
          state: "outgoing",
        };

        // Agregar PDF de factura como adjunto si existe
        if (invoicePdfBase64) {
          const attachmentId = await this.odooClient.create("ir.attachment", {
            name: `Factura_${invoiceName || params.turno_id}_${turno.clienta.replace(/\s/g, "_")}.pdf`,
            type: "binary",
            datas: invoicePdfBase64,
            res_model: "mail.mail",
            mimetype: "application/pdf",
          });

          mailValues.attachment_ids = [[6, 0, [attachmentId]]];
        }

        await this.odooClient.create("mail.mail", mailValues);
        // Email queda en estado "outgoing", el cron de Odoo lo envía automáticamente
      } catch (error) {
        logger.warn({ error }, "[ConfirmarPagoCompleto] Could not send confirmation email");
      }
    }

    // =========================================================================
    // PASO 8: Enviar notificación al vendedor (user_id del Lead)
    // =========================================================================
    // Mismo patrón que scheduleMeeting: notificar al vendedor responsable
    try {
      const leads = await this.odooClient.read("crm.lead", [params.lead_id], ["user_id"]);

      if (leads.length > 0 && leads[0].user_id && Array.isArray(leads[0].user_id) && leads[0].user_id[0]) {
        const userId = leads[0].user_id[0];
        const users = await this.odooClient.read("res.users", [userId], ["name", "email"]);

        if (users.length > 0 && users[0].email) {
          const vendorName = users[0].name || "Usuario";
          const vendorEmail = users[0].email;

          // turno.fecha_hora viene en UTC desde Odoo API, convertir a Argentina para mostrar
          const fechaHoraNotif = this.utcToArgentinaDate(turno.fecha_hora);
          const fechaFormateadaNotif = fechaHoraNotif.toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          });
          const horaFormateadaNotif = fechaHoraNotif.toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
          });

          const vendorServicio = esTurnoConHermanos ? servicioDisplayFusionado : servicioDisplay;
          const vendorPrecio = esTurnoConHermanos ? precioFusionado : turno.precio;

          const notificationBody = getVendorNotificacionTemplate({
            vendorName,
            clienta: turno.clienta,
            telefono: turno.telefono,
            servicio: vendorServicio,
            fecha: fechaFormateadaNotif,
            hora: horaFormateadaNotif,
            precio: vendorPrecio,
            montoPagado,
            mp_payment_id: params.mp_payment_id,
            pagos: pagosInfo.length > 0 ? pagosInfo : undefined,
            total_pagado_acumulado: totalPagadoAcumulado,
            pago_actual_mp_id: params.mp_payment_id,
          });

          await this.odooClient.create("mail.mail", {
            subject: `Pago Confirmado: ${vendorServicio} - ${turno.clienta}`,
            body_html: notificationBody,
            email_to: vendorEmail,
            auto_delete: false,
            state: "outgoing"
          });
        }
      }
    } catch (error) {
      logger.warn({ error }, "[ConfirmarPagoCompleto] Could not send vendor notification");
    }

    // =========================================================================
    // PASO 8b: Forzar envío inmediato de emails (PASO 7 + PASO 8)
    // =========================================================================
    // Sin esto, los emails quedan en estado "outgoing" esperando el cron de Odoo
    // que puede tardar varios minutos. process_email_queue() los envía al instante.
    try {
      await this.odooClient.execute("mail.mail", "process_email_queue", [], {});
      logger.info("[ConfirmarPagoCompleto] Email queue processed - emails sent immediately");
    } catch (queueError) {
      logger.warn({ queueError }, "[ConfirmarPagoCompleto] Could not process email queue, will be sent by cron");
    }

    // =========================================================================
    // PASO 9: Construir mensaje para WhatsApp
    // =========================================================================
    // turno.fecha_hora está en UTC, convertir a Argentina para mostrar
    // Para turno con hermanos: usar fechaHoraClienteFacing (jornada completa prevalece)
    const fechaHoraWA = this.utcToArgentinaDate(esTurnoConHermanos ? fechaHoraClienteFacing : turno.fecha_hora);
    const fechaFormateada = fechaHoraWA.toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
    const horaFormateada = fechaHoraWA.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });

    const waServicio = esTurnoConHermanos ? servicioDisplayFusionado : servicioDisplay;

    const mensajeWhatsapp = this.buildWhatsAppMessage({
      clienta: turno.clienta,
      servicio: waServicio,
      fecha: fechaFormateada,
      hora: horaFormateada,
      sena: montoPagado,
      mp_payment_id: params.mp_payment_id,
      email: emailToUse,
    });

    // =========================================================================
    // RETORNAR RESULTADO
    // =========================================================================
    const resultServicio = esTurnoConHermanos ? servicioDisplayFusionado : servicioDisplay;
    const resultPrecio = esTurnoConHermanos ? precioFusionado : turno.precio;

    logger.info(
      { turnoId: params.turno_id, eventId, invoiceId, esTurnoConHermanos, hermanos: turnosHermanos.map((h: any) => h.id) },
      "[ConfirmarPagoCompleto] Completed"
    );

    // Calcular pendiente restante después de este pago
    const pendienteRestante = Math.max(0, (resultPrecio || 0) - totalPagadoAcumulado);

    return {
      success: true,
      turno: {
        id: params.turno_id,
        clienta: turno.clienta,
        telefono: turno.telefono,
        email: emailToUse || null,
        servicio: turno.servicio,
        servicio_detalle: esTurnoConHermanos ? servicioDetalleFusionado : (turno.servicio_detalle || null),
        fecha_hora: turno.fecha_hora,
        precio: resultPrecio,
        duracion: turno.duracion,
        sena: montoPagado,
        estado: "confirmado",
      },
      pagos: {
        total_pagado: totalPagadoAcumulado,
        cantidad_pagos: pagosInfo.length,
        pendiente_restante: pendienteRestante,
        detalle: pagosInfo,
      },
      calendar_accept_url: calendarAcceptUrl,
      partner_id: partnerId,
      event_id: eventId,
      activity_id: activityId,
      invoice_id: invoiceId,
      invoice_name: invoiceName,
      invoice_pdf_base64: invoicePdfBase64,
      mensaje_whatsapp: mensajeWhatsapp,
      message: `Pago confirmado exitosamente para ${turno.clienta}. Turno para ${resultServicio} el ${fechaFormateada} a las ${horaFormateada}.${invoiceName ? ` Factura: ${invoiceName}` : ""}`,
    };
  }

  /**
   * Convierte datetime UTC (almacenado en Odoo) a Date en hora Argentina (UTC-3).
   * Para usar cuando se formatea hora para mostrar a humanos (emails, WhatsApp).
   */
  private utcToArgentinaDate(odooDatetimeUTC: string): Date {
    const [datePart, timePart] = odooDatetimeUTC.split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute, second] = (timePart || "00:00:00").split(":").map(Number);

    // Restar 3 horas (UTC-3 = Argentina)
    return new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second || 0));
  }

  /**
   * Agregar horas a un datetime en formato Odoo (YYYY-MM-DD HH:MM:SS)
   * Sin conversión de timezone - manipula el string directamente
   */
  private addHoursToOdooDatetime(odooDatetime: string, hours: number): string {
    // Parse: "2026-01-23 09:00:00" -> parts
    const [datePart, timePart] = odooDatetime.split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);

    // Crear fecha en UTC para evitar conversión de timezone
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    date.setUTCHours(date.getUTCHours() + hours);

    // Formatear de vuelta a formato Odoo
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    const h = String(date.getUTCHours()).padStart(2, "0");
    const min = String(date.getUTCMinutes()).padStart(2, "0");
    const s = String(date.getUTCSeconds()).padStart(2, "0");

    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }

  /**
   * Obtener etiqueta legible del servicio
   */
  private getServicioLabel(servicio: string): string {
    const servicioLabels: Record<string, string> = {
      corte_mujer: "Corte mujer",
      alisado_brasileno: "Alisado brasileño",
      alisado_keratina: "Alisado con keratina",
      mechas_completas: "Mechas completas",
      tintura_raiz: "Tintura raíz",
      tintura_completa: "Tintura completa",
      balayage: "Balayage",
      manicura_simple: "Manicura simple",
      manicura_semipermanente: "Manicura semipermanente",
      pedicura: "Pedicura",
      depilacion_cera_piernas: "Depilación cera piernas",
      depilacion_cera_axilas: "Depilación cera axilas",
      depilacion_cera_bikini: "Depilación cera bikini",
      depilacion_laser_piernas: "Depilación láser piernas",
      depilacion_laser_axilas: "Depilación láser axilas",
    };
    return servicioLabels[servicio] || servicio;
  }

  /**
   * Reverse lookup: nombre display → código Odoo.
   * Ej: "Alisado con keratina" → "alisado_keratina"
   */
  private findServicioCode(displayName: string): string | null {
    const normalized = displayName.toLowerCase().trim();
    const servicioLabels: Record<string, string> = {
      corte_mujer: "corte mujer",
      alisado_brasileno: "alisado brasileño",
      alisado_keratina: "alisado con keratina",
      mechas_completas: "mechas completas",
      tintura_raiz: "tintura raíz",
      tintura_completa: "tintura completa",
      balayage: "balayage",
      manicura_simple: "manicura simple",
      manicura_semipermanente: "manicura semipermanente",
      pedicura: "pedicura",
      depilacion_cera_piernas: "depilación cera piernas",
      depilacion_cera_axilas: "depilación cera axilas",
      depilacion_cera_bikini: "depilación cera bikini",
      depilacion_laser_piernas: "depilación láser piernas",
      depilacion_laser_axilas: "depilación láser axilas",
    };
    for (const [code, label] of Object.entries(servicioLabels)) {
      if (normalized === label || normalized.includes(label) || label.includes(normalized)) {
        return code;
      }
    }
    return null;
  }

  /**
   * Mapea código de servicio Odoo a categoría de tag CRM
   */
  private getServicioCategory(servicio: string): string {
    const categoryMap: Record<string, string> = {
      corte_mujer: "Corte",
      alisado_brasileno: "Alisado",
      alisado_keratina: "Alisado",
      mechas_completas: "Color",
      tintura_raiz: "Color",
      tintura_completa: "Color",
      balayage: "Color",
      manicura_simple: "Uñas",
      manicura_semipermanente: "Uñas",
      pedicura: "Uñas",
      depilacion_cera_piernas: "Depilación",
      depilacion_cera_axilas: "Depilación",
      depilacion_cera_bikini: "Depilación",
      depilacion_laser_piernas: "Depilación",
      depilacion_laser_axilas: "Depilación",
    };
    return categoryMap[servicio] || "";
  }

  private getServicioName(servicio: string): string {
    const serviceNameMap: Record<string, string> = {
      corte_mujer: "Corte mujer",
      alisado_brasileno: "Alisado brasileño",
      alisado_keratina: "Alisado keratina",
      mechas_completas: "Mechas completas",
      tintura_raiz: "Tintura raíz",
      tintura_completa: "Tintura completa",
      balayage: "Balayage",
      manicura_simple: "Manicura simple",
      manicura_semipermanente: "Manicura semipermanente",
      pedicura: "Pedicura",
      depilacion_cera_piernas: "Depilación cera piernas",
      depilacion_cera_axilas: "Depilación cera axilas",
      depilacion_cera_bikini: "Depilación cera bikini",
      depilacion_laser_piernas: "Depilación láser piernas",
      depilacion_laser_axilas: "Depilación láser axilas",
    };
    return serviceNameMap[servicio] || "";
  }

  /**
   * Mapea código de complejidad a nombre legible para tag CRM
   */
  private getComplejidadLabel(complejidad: string): string {
    const labels: Record<string, string> = {
      simple: "Simple",
      media: "Media",
      compleja: "Compleja",
      muy_compleja: "Muy Compleja",
    };
    return labels[complejidad] || "";
  }

  /**
   * Busca o crea tags en crm.tag y devuelve sus IDs.
   * Tags: categoría de servicio + complejidad máxima.
   */
  private async resolveLeadTags(
    servicio: string,
    complejidad: string | null,
    servicioDetalle?: string
  ): Promise<number[]> {
    const tagNames: string[] = [];

    // Si hay servicio_detalle con múltiples servicios (formato "Servicio A + Servicio B"),
    // extraer categoría y nombre de cada uno
    if (servicioDetalle && servicioDetalle.includes("+")) {
      const servicios = servicioDetalle.split("+").map((s) => s.trim());
      const categories = new Set<string>();
      const serviceNames = new Set<string>();
      for (const srv of servicios) {
        const code = this.findServicioCode(srv);
        if (code) {
          const cat = this.getServicioCategory(code);
          if (cat) categories.add(cat);
          const name = this.getServicioName(code);
          if (name) serviceNames.add(name);
        }
      }
      categories.forEach((c) => tagNames.push(c));
      serviceNames.forEach((n) => tagNames.push(n));
    } else {
      // Servicio único - comportamiento original
      const category = this.getServicioCategory(servicio);
      if (category) tagNames.push(category);
      const serviceName = this.getServicioName(servicio);
      if (serviceName) tagNames.push(serviceName);
    }

    if (complejidad) {
      const complejidadLabel = this.getComplejidadLabel(complejidad);
      if (complejidadLabel) tagNames.push(complejidadLabel);
    }

    if (tagNames.length === 0) return [];

    const tagIds: number[] = [];
    for (const name of tagNames) {
      // Buscar tag existente
      const existing = await this.odooClient.search(
        "crm.tag",
        [["name", "=", name]],
        { fields: ["id"], limit: 1 }
      );

      if (existing.length > 0) {
        tagIds.push(existing[0].id);
      } else {
        // Crear tag si no existe
        const newId = await this.odooClient.create("crm.tag", { name });
        tagIds.push(newId);
        logger.info({ tagName: name, tagId: newId }, "[ConfirmarPagoCompleto] Created new CRM tag");
      }
    }

    return tagIds;
  }

  /**
   * Construir mensaje de confirmación para WhatsApp
   */
  private buildWhatsAppMessage(data: {
    clienta: string;
    servicio: string;
    fecha: string;
    hora: string;
    sena: number;
    mp_payment_id: string;
    email: string | null;
  }): string {
    let mensaje = `*Pago recibido!*

Hola ${data.clienta}!

Tu turno ha sido *CONFIRMADO*

*Servicio:* ${data.servicio}
*Fecha:* ${data.fecha}
*Hora:* ${data.hora}

*Sena pagada:* $${data.sena.toLocaleString()}
*ID Pago:* ${data.mp_payment_id}`;

    if (data.email) {
      mensaje += `

Te enviamos un email a ${data.email} con el recibo de pago y los detalles de tu turno.`;
    }

    mensaje += `

Te esperamos! Estilos Leraysi`;

    return mensaje;
  }

  definition(): ToolDefinition {
    return {
      name: "leraysi_confirmar_pago_completo",
      description:
        "Confirmar pago de turno en Estilos Leraysi - Proceso completo post-pago. " +
        "Ejecuta: confirmar turno, obtener contacto del Lead, actualizar tags/revenue, mover a Won (Ganado), " +
        "crear evento calendario, crear factura en account.move, generar PDF factura (reporte nativo Odoo), enviar email confirmación. " +
        "Usar cuando se recibe notificación de pago aprobado de Mercado Pago.",
      inputSchema: {
        type: "object",
        properties: {
          turno_id: {
            type: "number",
            description: "ID del turno en Odoo (salon.turno)",
          },
          mp_payment_id: {
            type: "string",
            description: "ID del pago de Mercado Pago",
          },
          lead_id: {
            type: "number",
            description: "ID del Lead en CRM (crm.lead)",
          },
          conversation_id: {
            type: "number",
            description: "ID de conversación en Chatwoot (para WhatsApp)",
          },
          email_override: {
            type: "string",
            description: "Email alternativo si es diferente al del turno",
          },
          notas: {
            type: "string",
            description: "Notas adicionales sobre el pago",
          },
        },
        required: ["turno_id", "mp_payment_id", "lead_id"],
      },
    };
  }
}
