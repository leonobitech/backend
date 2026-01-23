import {
  confirmarPagoCompletoSchema,
  type ConfirmarPagoCompletoInput,
  type ConfirmarPagoCompletoResponse,
} from "./confirmar-pago-completo.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";
import { getTurnoConfirmadoEmailTemplate } from "@/prompts/email-templates";

/**
 * Tool consolidada para confirmar pago de turno en Estilos Leraysi
 *
 * Ejecuta todo el proceso post-pago en una sola llamada:
 * 1. Confirmar turno (estado=confirmado, sena_pagada=true)
 * 2. Crear contacto si no existe
 * 3. Vincular contacto al Lead
 * 4. Mover Lead a "Calificado"
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
      { turnoId: params.turno_id, leadId: params.lead_id, mpPaymentId: params.mp_payment_id },
      "[ConfirmarPagoCompleto] Starting payment confirmation process"
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
      "estado",
      "sena_pagada",
    ]);

    if (turnos.length === 0) {
      throw new Error(`Turno #${params.turno_id} no encontrado`);
    }

    const turno = turnos[0];

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

    logger.info({ turnoId: params.turno_id }, "[ConfirmarPagoCompleto] Turno confirmed");

    // =========================================================================
    // PASO 2: Crear o obtener contacto (res.partner)
    // =========================================================================
    const emailToUse = params.email_override || turno.email;
    let partnerId: number | null = null;

    // Buscar contacto existente por email o teléfono
    if (emailToUse) {
      const existingPartners = await this.odooClient.search(
        "res.partner",
        [["email", "=", emailToUse]],
        { fields: ["id"], limit: 1 }
      );
      if (existingPartners.length > 0) {
        partnerId = existingPartners[0].id;
        logger.info({ partnerId, email: emailToUse }, "[ConfirmarPagoCompleto] Found existing partner by email");
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
        logger.info({ partnerId, telefono: turno.telefono }, "[ConfirmarPagoCompleto] Found existing partner by phone");
      }
    }

    // Crear contacto si no existe
    if (!partnerId) {
      const partnerData: Record<string, any> = {
        name: turno.clienta,
        is_company: false,
        phone: turno.telefono,
      };
      if (emailToUse) partnerData.email = emailToUse;

      partnerId = await this.odooClient.create("res.partner", partnerData);
      logger.info({ partnerId, clienta: turno.clienta }, "[ConfirmarPagoCompleto] Created new partner");
    }

    // =========================================================================
    // PASO 3: Vincular contacto al Lead
    // =========================================================================
    await this.odooClient.write("crm.lead", [params.lead_id], {
      partner_id: partnerId,
    });

    // Registrar en el chatter del Lead
    await this.odooClient.postMessageToChatter({
      model: "crm.lead",
      resId: params.lead_id,
      body: `
        <p><strong>Pago de seña confirmado</strong></p>
        <ul>
          <li><strong>Clienta:</strong> ${turno.clienta}</li>
          <li><strong>Servicio:</strong> ${turno.servicio}</li>
          <li><strong>Monto seña:</strong> $${turno.sena.toLocaleString()}</li>
          <li><strong>MP Payment ID:</strong> ${params.mp_payment_id}</li>
        </ul>
        <p>Contacto vinculado automáticamente.</p>
        <p><em>Sistema automatizado Leonobitech</em></p>
      `,
      messageType: "comment",
    });

    logger.info({ leadId: params.lead_id, partnerId }, "[ConfirmarPagoCompleto] Partner linked to Lead");

    // =========================================================================
    // PASO 4: Mover Lead a "Qualified"
    // =========================================================================
    try {
      await this.odooClient.updateDealStage(params.lead_id, "Qualified");
      logger.info({ leadId: params.lead_id }, "[ConfirmarPagoCompleto] Lead moved to Qualified");
    } catch (error) {
      logger.warn({ error, leadId: params.lead_id }, "[ConfirmarPagoCompleto] Could not move Lead to Qualified");
    }

    // =========================================================================
    // PASO 5: Crear evento en calendario
    // =========================================================================
    let eventId: number | null = null;
    let activityId: number | null = null;

    try {
      // turno.fecha_hora está en hora local Argentina (UTC-3): "YYYY-MM-DD HH:MM:SS"
      // Odoo Calendar espera UTC, así que convertimos agregando 3 horas
      const startUTC = this.argentinaToUTC(turno.fecha_hora);
      const stopUTC = this.addHoursToOdooDatetime(startUTC, turno.duracion || 1);

      const eventValues: Record<string, any> = {
        name: `Turno: ${turno.servicio} - ${turno.clienta}`,
        start: startUTC,
        stop: stopUTC,
        duration: turno.duracion || 1,
        description: `Servicio: ${turno.servicio}\nClienta: ${turno.clienta}\nTeléfono: ${turno.telefono}\nPrecio total: $${turno.precio}\nSeña pagada: $${turno.sena}`,
        partner_ids: [[6, 0, [partnerId]]],
        opportunity_id: params.lead_id,
      };

      eventId = await this.odooClient.create("calendar.event", eventValues);
      logger.info({ eventId, leadId: params.lead_id }, "[ConfirmarPagoCompleto] Calendar event created");

      // Crear actividad vinculada (extraer fecha de la hora local Argentina)
      const deadlineDate = turno.fecha_hora.split(" ")[0];
      activityId = await this.odooClient.createActivity({
        activityType: "meeting",
        summary: `Turno: ${turno.servicio} - ${turno.clienta}`,
        resModel: "crm.lead",
        resId: params.lead_id,
        dateDeadline: deadlineDate,
        note: `Turno confirmado para ${turno.clienta}`,
        calendarEventId: eventId,
      });

      logger.info({ activityId, eventId }, "[ConfirmarPagoCompleto] Activity created and linked");
    } catch (error) {
      logger.warn({ error }, "[ConfirmarPagoCompleto] Could not create calendar event/activity");
    }

    // =========================================================================
    // PASO 6: Crear factura en account.move (módulo contabilidad Odoo)
    // =========================================================================
    let invoiceId: number | null = null;
    let invoiceName: string | null = null;
    let invoicePdfBase64: string | null = null;

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
        // Crear factura de cliente (out_invoice)
        const invoiceDate = new Date().toISOString().split("T")[0];
        const servicioLabel = this.getServicioLabel(turno.servicio);

        const invoiceLineValues: any = {
          name: `Seña - ${servicioLabel} - Turno #${params.turno_id}`,
          quantity: 1,
          price_unit: turno.sena,
        };

        // Solo agregar account_id si existe
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
        logger.info({ invoiceId, partnerId }, "[ConfirmarPagoCompleto] Invoice created in account.move");

        // Confirmar/publicar la factura (action_post)
        try {
          await this.odooClient.execute("account.move", "action_post", [[invoiceId]], {});
          logger.info({ invoiceId }, "[ConfirmarPagoCompleto] Invoice posted");
        } catch (postError) {
          logger.warn({ postError, invoiceId }, "[ConfirmarPagoCompleto] Could not post invoice, left as draft");
        }

        // Obtener nombre/número de factura
        const invoices = await this.odooClient.read("account.move", [invoiceId], ["name"]);
        if (invoices.length > 0) {
          invoiceName = invoices[0].name;
        }

        // Generar PDF usando reporte nativo de factura de Odoo
        try {
          const reportResult = await this.odooClient.execute(
            "ir.actions.report",
            "_render_qweb_pdf",
            ["account.account_invoices", [invoiceId]],
            {}
          );

          if (reportResult && reportResult[0]) {
            invoicePdfBase64 = Buffer.from(reportResult[0], "binary").toString("base64");
            logger.info({ invoiceId, invoiceName }, "[ConfirmarPagoCompleto] Invoice PDF generated");
          }
        } catch (pdfError) {
          logger.warn({ pdfError, invoiceId }, "[ConfirmarPagoCompleto] Could not generate invoice PDF");
        }
      }
    } catch (error) {
      logger.warn({ error }, "[ConfirmarPagoCompleto] Could not create invoice in account.move");
    }

    // =========================================================================
    // PASO 7: Enviar email de confirmación
    // =========================================================================
    if (emailToUse) {
      try {
        const fechaHora = new Date(turno.fecha_hora);
        const fechaFormateada = fechaHora.toLocaleDateString("es-AR", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const horaFormateada = fechaHora.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
        });

        const emailHtml = getTurnoConfirmadoEmailTemplate({
          clienta: turno.clienta,
          servicio: turno.servicio,
          servicio_detalle: turno.servicio_detalle,
          fecha: fechaFormateada,
          hora: horaFormateada,
          precio: turno.precio,
          sena: turno.sena,
          monto_restante: turno.precio - turno.sena,
          mp_payment_id: params.mp_payment_id,
          direccion: "Buenos Aires, Argentina", // TODO: Hacer configurable
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

        const mailId = await this.odooClient.create("mail.mail", mailValues);

        // Procesar cola de emails
        try {
          await this.odooClient.execute("mail.mail", "process_email_queue", [], {});
          logger.info({ mailId, email: emailToUse }, "[ConfirmarPagoCompleto] Confirmation email sent");
        } catch (sendError) {
          logger.warn({ sendError, mailId }, "[ConfirmarPagoCompleto] Email queued, will be sent by cron");
        }
      } catch (error) {
        logger.warn({ error }, "[ConfirmarPagoCompleto] Could not send confirmation email");
      }
    }

    // =========================================================================
    // PASO 8: Construir mensaje para WhatsApp
    // =========================================================================
    const fechaHora = new Date(turno.fecha_hora);
    const fechaFormateada = fechaHora.toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const horaFormateada = fechaHora.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const mensajeWhatsapp = this.buildWhatsAppMessage({
      clienta: turno.clienta,
      servicio: turno.servicio,
      fecha: fechaFormateada,
      hora: horaFormateada,
      sena: turno.sena,
      mp_payment_id: params.mp_payment_id,
      email: emailToUse,
    });

    // =========================================================================
    // RETORNAR RESULTADO
    // =========================================================================
    logger.info(
      { turnoId: params.turno_id, leadId: params.lead_id, partnerId, eventId, invoiceId, invoiceName },
      "[ConfirmarPagoCompleto] Payment confirmation completed successfully"
    );

    return {
      success: true,
      turno: {
        id: params.turno_id,
        clienta: turno.clienta,
        telefono: turno.telefono,
        email: emailToUse || null,
        servicio: turno.servicio,
        servicio_detalle: turno.servicio_detalle || null,
        fecha_hora: turno.fecha_hora,
        precio: turno.precio,
        sena: turno.sena,
        estado: "confirmado",
      },
      partner_id: partnerId,
      event_id: eventId,
      activity_id: activityId,
      invoice_id: invoiceId,
      invoice_name: invoiceName,
      invoice_pdf_base64: invoicePdfBase64,
      mensaje_whatsapp: mensajeWhatsapp,
      message: `Pago confirmado exitosamente para ${turno.clienta}. Turno para ${turno.servicio} el ${fechaFormateada} a las ${horaFormateada}.${invoiceName ? ` Factura: ${invoiceName}` : ""}`,
    };
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
   * Convertir hora local Argentina (UTC-3) a UTC
   * Agrega 3 horas para obtener UTC
   */
  private argentinaToUTC(argentinaDatetime: string): string {
    return this.addHoursToOdooDatetime(argentinaDatetime, 3);
  }

  /**
   * Obtener etiqueta legible del servicio
   */
  private getServicioLabel(servicio: string): string {
    const servicioLabels: Record<string, string> = {
      corte: "Corte",
      tintura: "Tintura",
      mechas: "Mechas",
      brushing: "Brushing",
      peinado: "Peinado",
      tratamiento: "Tratamiento Capilar",
      manicura: "Manicura",
      pedicura: "Pedicura",
      depilacion: "Depilación",
      maquillaje: "Maquillaje",
      otro: "Otro",
    };
    return servicioLabels[servicio] || servicio;
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
        "Ejecuta: confirmar turno, crear contacto, vincular a Lead, mover a Calificado, " +
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
