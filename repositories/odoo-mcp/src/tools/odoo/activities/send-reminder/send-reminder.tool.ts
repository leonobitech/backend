/**
 * Tool: odoo_send_meeting_reminder
 *
 * Envía un recordatorio por email sobre una reunión próxima.
 *
 * @module tools/odoo/activities/send-reminder
 */

import {
  sendReminderSchema,
  type SendReminderInput,
  type SendReminderResponse
} from "./send-reminder.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

export class SendReminderTool implements ITool<SendReminderInput, SendReminderResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<SendReminderResponse> {
    const params = sendReminderSchema.parse(input);

    // Buscar el próximo evento de la oportunidad si no se especifica eventId
    let eventId = params.eventId;

    if (!eventId) {
      const now = new Date().toISOString();
      const events = await this.odooClient.search(
        "calendar.event",
        [
          ["res_model", "=", "crm.lead"],
          ["res_id", "=", params.opportunityId],
          ["start", ">=", now]
        ],
        {
          fields: ["id"],
          limit: 1,
          order: "start asc"
        }
      );

      if (events.length === 0) {
        throw new Error(`No upcoming meetings found for opportunity #${params.opportunityId}`);
      }

      eventId = events[0].id;
    }

    // Obtener detalles del evento
    const events = await this.odooClient.read("calendar.event", [eventId], [
      "name",
      "start",
      "stop",
      "location",
      "description",
      "res_id"
    ]);

    const event = events[0];
    const opportunityId = event.res_id;

    // Formatear fecha
    const startDate = new Date(event.start);
    const formattedDate = startDate.toLocaleString("es-ES", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    // Calcular tiempo hasta la reunión
    const now = new Date();
    const timeUntil = startDate.getTime() - now.getTime();
    const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
    const daysUntil = Math.floor(hoursUntil / 24);

    let timeMessage = "";
    if (daysUntil >= 1) {
      timeMessage = `en ${daysUntil} día${daysUntil > 1 ? 's' : ''}`;
    } else if (hoursUntil >= 1) {
      timeMessage = `en ${hoursUntil} hora${hoursUntil > 1 ? 's' : ''}`;
    } else {
      timeMessage = "muy pronto";
    }

    // Crear email de recordatorio usando template
    const subject = `🔔 Recordatorio: ${event.name} - ${timeMessage}`;

    const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px;">🔔 Recordatorio de Reunión</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              ${params.customMessage ? `<p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">${params.customMessage}</p>` : ''}

              <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Este es un recordatorio de que tu reunión está programada para <strong>${timeMessage}</strong>.
              </p>

              <!-- Meeting Details -->
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; margin: 25px 0; border-radius: 8px; color: #ffffff;">
                <h2 style="margin: 0 0 20px 0; font-size: 20px;">📅 Detalles de la Reunión</h2>
                <table width="100%" style="border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; font-size: 14px; opacity: 0.9;">📌 Título:</td>
                    <td style="padding: 10px 0; font-size: 15px; font-weight: 600; text-align: right;">${event.name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; font-size: 14px; opacity: 0.9;">📆 Fecha y hora:</td>
                    <td style="padding: 10px 0; font-size: 15px; font-weight: 600; text-align: right;">${formattedDate}</td>
                  </tr>
                  ${event.location ? `
                  <tr>
                    <td style="padding: 10px 0; font-size: 14px; opacity: 0.9;">📍 Ubicación:</td>
                    <td style="padding: 10px 0; font-size: 15px; font-weight: 600; text-align: right;">${event.location}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>

              ${event.description ? `
              <div style="background-color: #f0f9ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #1f2937; font-size: 14px;"><strong>Descripción:</strong></p>
                <p style="margin: 10px 0 0 0; color: #4b5563; font-size: 14px;">${event.description}</p>
              </div>
              ` : ''}

              <p style="margin: 25px 0 0 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Nos vemos pronto,<br>
                <strong>Equipo Leonobitech</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="margin: 0 0 10px 0; color: #6c757d; font-size: 14px;">
                <strong>Leonobitech</strong><br>
                Automatización Inteligente con IA
              </p>
              <p style="margin: 0; color: #adb5bd; font-size: 12px;">
                📧 felix@leonobitech.com | 🌐 <a href="https://leonobitech.com" style="color: #667eea; text-decoration: none;">leonobitech.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Enviar el email
    const result = await this.odooClient.sendEmailToOpportunity({
      opportunityId,
      subject,
      body: emailBody
    });

    return {
      mailId: result.mailId,
      message: `Meeting reminder sent successfully (${timeMessage})`,
      recipient: result.recipientEmail,
      meetingDetails: {
        title: event.name,
        date: formattedDate,
        location: event.location
      }
    };
  }

  definition(): ToolDefinition {
    return {
      name: "odoo_send_meeting_reminder",
      description: "Send a meeting reminder email to the customer about an upcoming meeting/demo. Includes meeting details and time until meeting.",
      inputSchema: {
        type: "object",
        properties: {
          opportunityId: {
            type: "number",
            description: "ID of the opportunity (required)"
          },
          eventId: {
            type: "number",
            description: "ID of the calendar event (optional - will use next upcoming meeting if not provided)"
          },
          customMessage: {
            type: "string",
            description: "Custom message to include at the beginning of the reminder email (optional)"
          }
        },
        required: ["opportunityId"]
      }
    };
  }
}
