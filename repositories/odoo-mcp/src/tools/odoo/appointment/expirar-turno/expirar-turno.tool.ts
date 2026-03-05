import {
  expireBookingSchema,
  type ExpireBookingInput,
  type ExpireBookingResponse,
} from "./expirar-turno.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

export class AppointmentExpireTool
  implements ITool<ExpireBookingInput, ExpireBookingResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<ExpireBookingResponse> {
    const params = expireBookingSchema.parse(input);

    logger.info(
      { turnoId: params.booking_id },
      "[ExpirarTurno] Processing expired appointment"
    );

    // 1. Read current booking (include pending_changes for auto-detect type)
    const turnos = await this.odooClient.read(
      "appointment.booking",
      [params.booking_id],
      ["client_name", "state", "lead_id", "pending_changes"]
    );

    if (turnos.length === 0) {
      throw new Error(`Turno #${params.booking_id} no encontrado`);
    }

    const turno = turnos[0];
    const estadoAnterior = turno.state;

    if (estadoAnterior === "cancelled" || estadoAnterior === "completed") {
      return {
        bookingId: params.booking_id,
        client_name: turno.client_name,
        previous_state: estadoAnterior,
        new_state: estadoAnterior,
        lead_reverted: false,
        lead_id: null,
        message: `Turno #${params.booking_id} ya esta ${estadoAnterior}, no se modifica.`,
      };
    }

    // AUTO-DETECT: If has pending_changes, it's an added service that expired.
    // Revert to confirmed instead of cancelling (original booking remains active).
    if (turno.pending_changes) {
      await this.odooClient.execute(
        "appointment.booking",
        "api_revert_added_service",
        [params.booking_id]
      );

      logger.info(
        { bookingId: params.booking_id, estadoAnterior },
        "[ExpirarTurno] Service addition reverted (pending_changes detected)"
      );

      return {
        bookingId: params.booking_id,
        client_name: turno.client_name,
        previous_state: estadoAnterior,
        new_state: "confirmed",
        lead_reverted: false,
        lead_id: turno.lead_id ? turno.lead_id[0] : null,
        message: `Servicio agregado de ${turno.client_name} expirado. Turno original mantenido como confirmado.`,
      };
    }

    // NORMAL CASE: New unpaid booking -> cancel completely

    // 2. Cancel booking in Odoo
    await this.odooClient.write("appointment.booking", [params.booking_id], {
      state: "cancelled",
    });

    // 3. Record reason
    // Use api_post_message (Python Markup()) to avoid double-escaping HTML via XML-RPC
    await this.odooClient.execute(
      "appointment.booking",
      "api_post_message",
      [params.booking_id,
        `<strong>Turno expirado</strong><br/>` +
        `El link de pago expiró sin completar el pago. Slot liberado automáticamente.`
      ]
    );

    // 4. Revert CRM lead if exists AND has no other active bookings
    let leadReverted = false;
    const leadId = turno.lead_id ? turno.lead_id[0] : null;

    if (leadId) {
      try {
        // Check if lead has other active bookings (confirmed or pending_payment)
        // If yes -> DO NOT revert lead (e.g., additional booking expired but original is still active)
        const otrosTurnosActivos = await this.odooClient.search(
          "appointment.booking",
          [
            ["lead_id", "=", leadId],
            ["id", "!=", params.booking_id],
            ["state", "in", ["confirmed", "pending_payment"]],
          ],
          { fields: ["id"], limit: 1 }
        );

        if (otrosTurnosActivos.length > 0) {
          logger.info(
            { bookingId: params.booking_id, leadId, otroTurnoId: otrosTurnosActivos[0].id },
            "[ExpirarTurno] Lead has other active turnos, skipping CRM revert"
          );
        } else {
          // No other active bookings -> revert lead to Qualified
          const stages = await this.odooClient.search(
            "crm.stage",
            [["name", "ilike", "Qualified"]],
            { fields: ["id", "name"], limit: 1 }
          );

          if (stages.length > 0) {
            const qualifiedStageId = stages[0].id;
            await this.odooClient.write("crm.lead", [leadId], {
              stage_id: qualifiedStageId,
              expected_revenue: 0,
            });
            leadReverted = true;

            logger.info(
              { bookingId: params.booking_id, leadId, stageId: qualifiedStageId },
              "[ExpirarTurno] CRM lead reverted to Qualified"
            );
          }
        }
      } catch (err) {
        logger.warn(
          { bookingId: params.booking_id, leadId, error: String(err) },
          "[ExpirarTurno] Failed to revert CRM lead, continuing"
        );
      }
    }

    logger.info(
      { bookingId: params.booking_id, estadoAnterior, leadReverted },
      "[ExpirarTurno] Appointment expired successfully"
    );

    return {
      bookingId: params.booking_id,
      client_name: turno.client_name,
      previous_state: estadoAnterior,
      new_state: "cancelled",
      lead_reverted: leadReverted,
      lead_id: leadId,
      message: `Turno de ${turno.client_name} expirado. ${leadReverted ? "CRM lead revertido a Qualified." : ""}`,
    };
  }

  definition(): ToolDefinition {
    return {
      name: "appointment_expire",
      description:
        "Expire a booking with an overdue pending payment. " +
        "Cancels the booking in Odoo, reverts the CRM lead to Qualified, " +
        "and clears the expected_revenue. Used by the expiration cron job.",
      inputSchema: {
        type: "object",
        properties: {
          booking_id: {
            type: "number",
            description: "ID of the booking (appointment.booking) to expire",
          },
        },
        required: ["booking_id"],
      },
    };
  }
}
