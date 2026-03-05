import {
  confirmBookingSchema,
  type ConfirmBookingInput,
  type ConfirmBookingResponse,
} from "./confirmar-turno.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

export class AppointmentConfirmTool
  implements ITool<ConfirmBookingInput, ConfirmBookingResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<ConfirmBookingResponse> {
    const params = confirmBookingSchema.parse(input);

    logger.info(
      { turnoId: params.booking_id },
      "[ConfirmarTurno] Confirming appointment"
    );

    // Get current booking data
    const turnos = await this.odooClient.read("appointment.booking", [params.booking_id], [
      "client_name",
      "phone",
      "service_type",
      "scheduled_datetime",
      "state",
      "deposit_paid",
    ]);

    if (turnos.length === 0) {
      throw new Error(`Turno #${params.booking_id} no encontrado`);
    }

    const turno = turnos[0];
    const estadoAnterior = turno.state;

    // Verify booking is not already completed or cancelled
    if (estadoAnterior === "completed") {
      throw new Error(`El turno #${params.booking_id} ya está completado`);
    }
    if (estadoAnterior === "cancelled") {
      throw new Error(`El turno #${params.booking_id} está cancelado`);
    }

    // Update booking to confirmed
    const updateValues: Record<string, any> = {
      state: "confirmed",
      deposit_paid: true,
    };

    if (params.mp_payment_id) {
      updateValues.mp_payment_id = params.mp_payment_id;
    }

    await this.odooClient.write("appointment.booking", [params.booking_id], updateValues);

    // Add note if provided
    if (params.notes) {
      await this.odooClient.execute(
        "appointment.booking",
        "message_post",
        [[params.booking_id]],
        {
          body: `<p>Turno confirmado manualmente. ${params.notes}</p>`,
          message_type: "comment",
        }
      );
    }

    logger.info(
      { turnoId: params.booking_id, estadoAnterior, estadoNuevo: "confirmed" },
      "[ConfirmarTurno] Appointment confirmed"
    );

    return {
      bookingId: params.booking_id,
      client_name: turno.client_name,
      previous_state: estadoAnterior,
      new_state: "confirmed",
      scheduled_datetime: turno.scheduled_datetime,
      service_type: turno.service_type,
      message: `Turno de ${turno.client_name} confirmado exitosamente. La seña ha sido marcada como pagada.`,
    };
  }

  definition(): ToolDefinition {
    return {
      name: "appointment_confirm",
      description:
        "Confirm a booking after receiving the deposit payment. " +
        "Changes state from 'pending_payment' to 'confirmed' and marks the deposit as paid. " +
        "Use when the client confirms having made the payment via Mercado Pago or cash.",
      inputSchema: {
        type: "object",
        properties: {
          booking_id: {
            type: "number",
            description: "ID of the booking to confirm",
          },
          mp_payment_id: {
            type: "string",
            description:
              "Mercado Pago payment ID (optional, registered automatically via webhook)",
          },
          notes: {
            type: "string",
            description: "Additional notes about the confirmation (e.g., 'Paid in cash')",
          },
        },
        required: ["booking_id"],
      },
    };
  }
}
