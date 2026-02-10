import {
  reprogramarTurnoSchema,
  type ReprogramarTurnoInput,
  type ReprogramarTurnoResponse,
} from "./reprogramar-turno.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

export class ReprogramarTurnoTool
  implements ITool<ReprogramarTurnoInput, ReprogramarTurnoResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<ReprogramarTurnoResponse> {
    const params = reprogramarTurnoSchema.parse(input);

    logger.info(
      { leadId: params.lead_id, nuevaFecha: params.nueva_fecha_hora },
      "[ReprogramarTurno] Processing"
    );

    // =========================================================================
    // PASO 1: Buscar turno activo por lead_id
    // =========================================================================
    const turnosEncontrados = await this.odooClient.search(
      "salon.turno",
      [
        ["lead_id", "=", params.lead_id],
        ["estado", "in", ["pendiente_pago", "confirmado"]],
      ],
      { fields: ["id"], limit: 1, order: "id desc" }
    );

    if (turnosEncontrados.length === 0) {
      throw new Error(
        `No se encontró turno activo para lead #${params.lead_id}. ` +
        `Solo se pueden reprogramar turnos pendiente_pago o confirmados.`
      );
    }

    const turnoId = turnosEncontrados[0].id;

    // =========================================================================
    // PASO 2: Obtener turno completo y validar estado
    // =========================================================================
    const turnos = await this.odooClient.read("salon.turno", [turnoId], [
      "clienta",
      "telefono",
      "email",
      "servicio",
      "servicio_detalle",
      "fecha_hora",
      "estado",
      "duracion",
      "precio",
      "sena",
      "lead_id",
      "complejidad_maxima",
      "monto_pago_pendiente",
      "notas",
    ]);

    if (turnos.length === 0) {
      throw new Error(`Turno #${turnoId} no encontrado`);
    }

    const turno = turnos[0];
    const fechaHoraAnterior = turno.fecha_hora;
    const estadoActual = turno.estado as "pendiente_pago" | "confirmado";

    // Nombre legible del servicio: preferir servicio_detalle (combinado),
    // fallback a servicio formateado (snake_case → Title Case)
    const servicioDisplay = turno.servicio_detalle
      || (turno.servicio as string || "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      || "Servicio";

    if (!["pendiente_pago", "confirmado"].includes(estadoActual)) {
      throw new Error(
        `El turno #${turnoId} no puede reprogramarse (estado: ${estadoActual}). ` +
        `Solo se pueden reprogramar turnos pendiente_pago o confirmados.`
      );
    }

    // Normalizar nueva fecha
    let nuevaFechaHora = params.nueva_fecha_hora;
    if (nuevaFechaHora.includes("T")) {
      nuevaFechaHora = nuevaFechaHora.replace("T", " ");
    }
    if (nuevaFechaHora.length === 16) {
      nuevaFechaHora += ":00";
    }

    // Convertir hora local Argentina (UTC-3) a UTC para Odoo
    const nuevaFechaHoraUTC = this.argentinaToUTC(nuevaFechaHora);

    const acciones: string[] = [];
    let nuevoTurnoId: number | null = null;
    let linkPago: string | undefined;
    let sena: number | undefined;

    // =========================================================================
    // CASO A: PENDIENTE_PAGO → Cancelar viejo + Crear nuevo turno
    // =========================================================================
    if (estadoActual === "pendiente_pago") {
      // 1. Cancelar turno viejo
      await this.odooClient.write("salon.turno", [turnoId], {
        estado: "cancelado",
      });
      await this.odooClient.execute("salon.turno", "message_post", [[turnoId]], {
        body: `<p><strong>🔄 Turno reprogramado</strong></p>
               <p>Motivo: ${params.motivo}</p>
               <p>Este turno fue cancelado y se creó uno nuevo con la fecha actualizada.</p>`,
        message_type: "comment",
      });
      acciones.push("Turno anterior cancelado");

      // 2. Crear nuevo turno (con fecha en UTC)
      const nuevoTurnoValues: Record<string, any> = {
        clienta: turno.clienta,
        telefono: turno.telefono,
        email: turno.email,
        servicio: turno.servicio,
        servicio_detalle: turno.servicio_detalle,
        fecha_hora: nuevaFechaHoraUTC,
        precio: turno.precio,
        duracion: turno.duracion || 1,
        lead_id: turno.lead_id && Array.isArray(turno.lead_id) ? turno.lead_id[0] : turno.lead_id,
        estado: "pendiente_pago",
      };

      // Copiar campos opcionales del turno original
      if (turno.complejidad_maxima) nuevoTurnoValues.complejidad_maxima = turno.complejidad_maxima;
      if (turno.monto_pago_pendiente) nuevoTurnoValues.monto_pago_pendiente = turno.monto_pago_pendiente;
      if (turno.notas) nuevoTurnoValues.notas = turno.notas;

      nuevoTurnoId = await this.odooClient.create("salon.turno", nuevoTurnoValues);
      acciones.push(`Nuevo turno #${nuevoTurnoId} creado`);

      // 3. Generar link de pago
      try {
        await this.odooClient.execute("salon.turno", "action_generar_link_pago", [[nuevoTurnoId]]);
        const nuevosTurnos = await this.odooClient.read("salon.turno", [nuevoTurnoId], ["link_pago", "sena"]);
        if (nuevosTurnos.length > 0) {
          linkPago = nuevosTurnos[0].link_pago || "";
          sena = nuevosTurnos[0].sena || Math.round(turno.precio * 0.3);
        }
        acciones.push("Nuevo link de pago generado");
      } catch (error) {
        logger.warn({ error }, "[ReprogramarTurno] Could not generate payment link");
        sena = Math.round(turno.precio * 0.3);
      }

      // 4. Registrar en nuevo turno
      await this.odooClient.execute("salon.turno", "message_post", [[nuevoTurnoId]], {
        body: `<p><strong>🔄 Turno creado por reprogramación</strong></p>
               <p>Turno original: #${turnoId}</p>
               <p>Fecha anterior: ${fechaHoraAnterior}</p>
               <p>Nueva fecha: ${nuevaFechaHora}</p>
               <p>Motivo: ${params.motivo}</p>`,
        message_type: "comment",
      });
    }

    // =========================================================================
    // CASO B: CONFIRMADO → Actualizar turno + Borrar/crear calendario + Email
    // =========================================================================
    if (estadoActual === "confirmado") {
      const leadId = turno.lead_id && Array.isArray(turno.lead_id)
        ? turno.lead_id[0]
        : turno.lead_id;

      // 1. Actualizar fecha en turno (con fecha en UTC)
      await this.odooClient.write("salon.turno", [turnoId], {
        fecha_hora: nuevaFechaHoraUTC,
      });
      acciones.push("Fecha actualizada en turno");

      // 2. Borrar evento de calendario viejo y crear uno nuevo
      if (leadId) {
        try {
          const eventosViejos = await this.odooClient.search(
            "calendar.event",
            [["opportunity_id", "=", leadId]],
            { fields: ["id"], limit: 10 }
          );

          // Borrar eventos viejos
          for (const evento of eventosViejos) {
            await this.odooClient.unlink("calendar.event", [evento.id]);
          }
          if (eventosViejos.length > 0) {
            acciones.push(`${eventosViejos.length} evento(s) de calendario eliminado(s)`);
          }

          // Crear nuevo evento
          const duracion = turno.duracion || 1;
          const fechaLocal = new Date(nuevaFechaHora.replace(" ", "T") + "-03:00");
          const startUTC = fechaLocal.toISOString().replace("T", " ").slice(0, 19);
          const fechaFin = new Date(fechaLocal.getTime() + duracion * 60 * 60 * 1000);
          const stopUTC = fechaFin.toISOString().replace("T", " ").slice(0, 19);

          // Obtener partner_ids
          const leads = await this.odooClient.read("crm.lead", [leadId], ["partner_id", "user_id"]);
          const eventPartnerIds: number[] = [];

          if (leads.length > 0) {
            const lead = leads[0];
            if (lead.partner_id && Array.isArray(lead.partner_id) && lead.partner_id[0]) {
              eventPartnerIds.push(lead.partner_id[0]);
            }

            let effectiveUserId = lead.user_id && Array.isArray(lead.user_id) ? lead.user_id[0] : undefined;
            if (!effectiveUserId) {
              effectiveUserId = await this.odooClient.getUid();
            }

            const users = await this.odooClient.read("res.users", [effectiveUserId], ["partner_id"]);
            if (users.length > 0 && users[0].partner_id && Array.isArray(users[0].partner_id)) {
              eventPartnerIds.push(users[0].partner_id[0]);
            }

            const eventValues: Record<string, any> = {
              name: `Turno REPROGRAMADO: ${servicioDisplay} - ${turno.clienta}`,
              start: startUTC,
              stop: stopUTC,
              duration: duracion,
              description: `TURNO REPROGRAMADO\n\nFecha anterior: ${fechaHoraAnterior}\nMotivo: ${params.motivo}\n\nServicio: ${servicioDisplay}\nClienta: ${turno.clienta}\nTeléfono: ${turno.telefono}\nPrecio: $${turno.precio}`,
              partner_ids: [[6, 0, eventPartnerIds]],
              opportunity_id: leadId,
              user_id: effectiveUserId,
            };

            const nuevoEventoId = await this.odooClient.create("calendar.event", eventValues);
            acciones.push("Nuevo evento de calendario creado");

            // 2b. Crear actividad en el Lead vinculada al evento
            try {
              // Buscar tipo de actividad "Meeting"
              const activityTypes = await this.odooClient.search(
                "mail.activity.type",
                [["name", "ilike", "Meeting"]],
                { fields: ["id"], limit: 1 }
              );

              const activityTypeId = activityTypes.length > 0 ? activityTypes[0].id : 1;
              const fechaSoloDate = nuevaFechaHora.split(" ")[0];

              await this.odooClient.create("mail.activity", {
                res_model_id: await this.getModelId("crm.lead"),
                res_id: leadId,
                activity_type_id: activityTypeId,
                summary: `Turno REPROGRAMADO: ${servicioDisplay}`,
                note: `<p>Turno reprogramado para ${turno.clienta}</p>
                       <p><strong>Servicio:</strong> ${servicioDisplay}</p>
                       <p><strong>Fecha anterior:</strong> ${fechaHoraAnterior}</p>
                       <p><strong>Nueva fecha:</strong> ${nuevaFechaHora}</p>
                       <p><strong>Motivo:</strong> ${params.motivo}</p>`,
                date_deadline: fechaSoloDate,
                user_id: effectiveUserId,
                calendar_event_id: nuevoEventoId,
              });
              acciones.push("Actividad creada en Lead");
            } catch (actError) {
              logger.warn({ actError }, "[ReprogramarTurno] Could not create activity on Lead");
            }

            // 2c. Registrar en chatter del Lead
            try {
              await this.odooClient.execute("crm.lead", "message_post", [[leadId]], {
                body: `<p><strong>🔄 Turno reprogramado</strong></p>
                       <p><strong>Clienta:</strong> ${turno.clienta}</p>
                       <p><strong>Servicio:</strong> ${servicioDisplay}</p>
                       <p><strong>Fecha anterior:</strong> ${fechaHoraAnterior}</p>
                       <p><strong>Nueva fecha:</strong> ${nuevaFechaHora}</p>
                       <p><strong>Motivo:</strong> ${params.motivo}</p>`,
                message_type: "comment",
              });
              acciones.push("Mensaje registrado en chatter del Lead");
            } catch (msgError) {
              logger.warn({ msgError }, "[ReprogramarTurno] Could not post to Lead chatter");
            }
          }
        } catch (error) {
          logger.warn({ error }, "[ReprogramarTurno] Could not update calendar");
        }
      }

      // 3. Enviar notificación al vendedor (user_id del Lead)
      if (leadId) {
        try {
          const leadsForNotif = await this.odooClient.read("crm.lead", [leadId], ["user_id"]);

          if (leadsForNotif.length > 0 && leadsForNotif[0].user_id && Array.isArray(leadsForNotif[0].user_id) && leadsForNotif[0].user_id[0]) {
            const userId = leadsForNotif[0].user_id[0];
            const users = await this.odooClient.read("res.users", [userId], ["name", "email"]);

            if (users.length > 0 && users[0].email) {
              const vendorName = users[0].name || "Usuario";
              const vendorEmail = users[0].email;

              const fechaHumanaAnterior = this.formatearFechaHumana(fechaHoraAnterior);
              const fechaHumanaNueva = this.formatearFechaHumana(nuevaFechaHora);

              const notificationBody = `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                  <h2 style="color: #f59e0b;">🔄 Turno Reprogramado</h2>
                  <p>Hola <strong>${vendorName}</strong>,</p>
                  <p>Se ha reprogramado el siguiente turno:</p>

                  <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                    <h3 style="margin: 0 0 15px 0; color: #92400e;">Cambio de Fecha</h3>
                    <p style="margin: 5px 0; text-decoration: line-through; color: #92400e;">
                      <strong>Fecha anterior:</strong> ${fechaHumanaAnterior}
                    </p>
                    <p style="margin: 5px 0; color: #059669; font-size: 18px;">
                      <strong>Nueva fecha:</strong> ${fechaHumanaNueva}
                    </p>
                  </div>

                  <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 5px 0;"><strong>👤 Clienta:</strong> ${turno.clienta}</p>
                    <p style="margin: 5px 0;"><strong>💇‍♀️ Servicio:</strong> ${servicioDisplay}</p>
                    <p style="margin: 5px 0;"><strong>📱 Teléfono:</strong> ${turno.telefono}</p>
                    <p style="margin: 5px 0;"><strong>💰 Precio:</strong> $${turno.precio.toLocaleString('es-AR')}</p>
                    <p style="margin: 5px 0; color: #666;"><strong>Motivo:</strong> ${params.motivo}</p>
                  </div>

                  <p style="color: #666; font-size: 14px;">El calendario de Odoo ya fue actualizado con la nueva fecha.</p>
                  <p style="color: #999; font-size: 12px; margin-top: 20px;"><em>Sistema automatizado Leonobitech - Estilos Leraysi</em></p>
                </div>
              `;

              await this.odooClient.create("mail.mail", {
                subject: `🔄 Turno Reprogramado: ${servicioDisplay} - ${turno.clienta}`,
                body_html: notificationBody,
                email_to: vendorEmail,
                auto_delete: false,
                state: "outgoing"
              });

              try {
                await this.odooClient.execute("mail.mail", "process_email_queue", [], {});
              } catch {
                // Email quedará en cola, será enviado por el cron de Odoo
              }

              acciones.push("Notificación enviada al vendedor");
            }
          }
        } catch (error) {
          logger.warn({ error }, "[ReprogramarTurno] Could not send vendor notification");
        }
      }

      // 4. Enviar email de reprogramación a la clienta
      if (turno.email) {
        try {
          const fechaHumana = this.formatearFechaHumana(nuevaFechaHora);
          const fechaAnteriorHumana = this.formatearFechaHumana(fechaHoraAnterior);

          const emailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #8B5CF6;">🔄 Tu turno ha sido reprogramado</h2>
              <p>Hola ${turno.clienta},</p>
              <p>Te informamos que tu turno ha sido reprogramado:</p>
              <div style="background: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0; text-decoration: line-through; color: #92400E;">
                  <strong>Fecha anterior:</strong> ${fechaAnteriorHumana}
                </p>
                <p style="margin: 5px 0; color: #059669; font-size: 18px;">
                  <strong>Nueva fecha:</strong> ${fechaHumana}
                </p>
              </div>
              <div style="background: #F3F4F6; padding: 15px; border-radius: 8px;">
                <p style="margin: 5px 0;"><strong>Servicio:</strong> ${servicioDisplay}</p>
                <p style="margin: 5px 0;"><strong>Motivo:</strong> ${params.motivo}</p>
              </div>
              <p style="margin-top: 20px;">Tu seña ya está confirmada, no necesitás hacer nada más.</p>
              <p style="color: #8B5CF6; margin-top: 30px;">⋆˚🧚‍♀️ Te esperamos en Estilos Leraysi</p>
            </div>
          `;

          await this.odooClient.create("mail.mail", {
            subject: `🔄 Turno Reprogramado: ${servicioDisplay} - ${fechaHumana}`,
            body_html: emailBody,
            email_to: turno.email,
            auto_delete: false,
            state: "outgoing",
          });

          try {
            await this.odooClient.execute("mail.mail", "process_email_queue", [], {});
          } catch { /* Email quedará en cola */ }

          acciones.push("Email de notificación enviado");
        } catch (error) {
          logger.warn({ error }, "[ReprogramarTurno] Could not send email");
        }
      }

      // 5. Registrar en chatter del turno
      await this.odooClient.execute("salon.turno", "message_post", [[turnoId]], {
        body: `<p><strong>🔄 Turno reprogramado</strong></p>
               <p><strong>Fecha anterior:</strong> ${fechaHoraAnterior}</p>
               <p><strong>Nueva fecha:</strong> ${nuevaFechaHora}</p>
               <p><strong>Motivo:</strong> ${params.motivo}</p>
               <p><strong>Acciones:</strong> ${acciones.join(", ")}</p>`,
        message_type: "comment",
      });
    }

    // =========================================================================
    // RETORNAR RESULTADO
    // =========================================================================
    const fechaHumana = this.formatearFechaHumana(nuevaFechaHora);

    logger.info(
      { turnoIdAnterior: turnoId, turnoIdNuevo: nuevoTurnoId, acciones },
      "[ReprogramarTurno] Completed"
    );

    return {
      turno_id_anterior: turnoId,
      turno_id_nuevo: nuevoTurnoId,
      clienta: turno.clienta,
      telefono: turno.telefono,
      servicio: servicioDisplay,
      fecha_hora_anterior: fechaHoraAnterior,
      fecha_hora_nueva: nuevaFechaHora,
      estado_anterior: estadoActual,
      acciones,
      link_pago: linkPago,
      sena,
      message: estadoActual === "pendiente_pago"
        ? `Turno reprogramado. Nuevo turno #${nuevoTurnoId} para el ${fechaHumana}. Nuevo link de pago generado.`
        : `Turno reprogramado para el ${fechaHumana}. Calendario actualizado y notificación enviada.`,
    };
  }

  private formatearFechaHumana(fechaStr: string): string {
    const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                   "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const fecha = new Date(fechaStr.replace(" ", "T"));
    const hora = fechaStr.split(" ")[1]?.slice(0, 5) || "00:00";
    return `${dias[fecha.getDay()]} ${fecha.getDate()} de ${meses[fecha.getMonth()]} a las ${hora}`;
  }

  private async getModelId(modelName: string): Promise<number> {
    const models = await this.odooClient.search(
      "ir.model",
      [["model", "=", modelName]],
      { fields: ["id"], limit: 1 }
    );
    if (models.length === 0) {
      throw new Error(`Model ${modelName} not found`);
    }
    return models[0].id;
  }

  /**
   * Convierte hora local Argentina (UTC-3) a UTC.
   * Suma 3 horas para obtener UTC.
   */
  private argentinaToUTC(fechaHora: string): string {
    // Parse: "2026-01-23 14:00:00" -> Date
    const [datePart, timePart] = fechaHora.split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute, second] = (timePart || "00:00:00").split(":").map(Number);

    // Crear fecha asumiendo Argentina (UTC-3), convertir a UTC sumando 3 horas
    const date = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, second || 0));

    // Formatear a formato Odoo
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    const h = String(date.getUTCHours()).padStart(2, "0");
    const min = String(date.getUTCMinutes()).padStart(2, "0");
    const s = String(date.getUTCSeconds()).padStart(2, "0");

    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }

  definition(): ToolDefinition {
    return {
      name: "leraysi_reprogramar_turno",
      description:
        "Reprograma un turno en Estilos Leraysi buscándolo por lead_id. " +
        "Si está pendiente_pago: cancela el viejo y crea uno nuevo con nuevo link MP. " +
        "Si está confirmado: actualiza turno, borra/crea evento calendario, envía email.",
      inputSchema: {
        type: "object",
        properties: {
          lead_id: {
            type: "number",
            description: "ID del Lead (crm.lead) de la clienta",
          },
          nueva_fecha_hora: {
            type: "string",
            description: "Nueva fecha y hora en formato YYYY-MM-DD HH:MM",
          },
          motivo: {
            type: "string",
            description: "Motivo de la reprogramación",
          },
        },
        required: ["lead_id", "nueva_fecha_hora", "motivo"],
      },
    };
  }
}
