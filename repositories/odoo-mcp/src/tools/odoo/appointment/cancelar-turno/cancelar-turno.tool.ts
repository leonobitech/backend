import {
  cancelBookingSchema,
  type CancelBookingInput,
  type CancelBookingResponse,
} from "./cancelar-turno.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

export class AppointmentCancelTool
  implements ITool<CancelBookingInput, CancelBookingResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<CancelBookingResponse> {
    const params = cancelBookingSchema.parse(input);

    logger.info(
      { turnoId: params.booking_id, motivo: params.reason },
      "[CancelarTurno] Cancelling appointment"
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

    // Verify booking is not already cancelled or completed
    if (estadoAnterior === "cancelled") {
      throw new Error(`El turno #${params.booking_id} ya está cancelado`);
    }
    if (estadoAnterior === "completed") {
      throw new Error(`El turno #${params.booking_id} ya fue completado y no puede cancelarse`);
    }

    // Cancel the booking
    await this.odooClient.write("appointment.booking", [params.booking_id], {
      state: "cancelled",
    });

    // Add note with reason
    const motivoMsg = params.reason
      ? `Motivo: ${params.reason}`
      : "Sin motivo especificado";

    // Use api_post_message (Python Markup()) to avoid double-escaping HTML via XML-RPC
    await this.odooClient.execute(
      "appointment.booking",
      "api_post_message",
      [params.booking_id,
        `<strong>Turno cancelado</strong><br/>${motivoMsg}`
      ]
    );

    // TODO: If notify_client is true, send SMS/WhatsApp
    if (params.notify_client) {
      logger.info(
        { turnoId: params.booking_id, telefono: turno.phone },
        "[CancelarTurno] Client notification requested (not implemented)"
      );
    }

    logger.info(
      { turnoId: params.booking_id, estadoAnterior, estadoNuevo: "cancelled" },
      "[CancelarTurno] Appointment cancelled"
    );

    // Warning message if deposit was already paid
    let message = `Turno de ${turno.client_name} cancelado.`;
    if (turno.deposit_paid) {
      message += " ATENCIÓN: La clienta ya había pagado la seña. Considerar reembolso.";
    }

    return {
      bookingId: params.booking_id,
      client_name: turno.client_name,
      phone: turno.phone,
      previous_state: estadoAnterior,
      new_state: "cancelled",
      scheduled_datetime: turno.scheduled_datetime,
      service_type: turno.service_type,
      deposit_paid: turno.deposit_paid,
      message,
    };
  }

  definition(): ToolDefinition {
    return {
      name: "appointment_cancel",
      description:
        "Cancel an existing booking in the appointment system. " +
        "Allows specifying a cancellation reason. " +
        "If the client already paid the deposit, shows a warning to consider a refund.",
      inputSchema: {
        type: "object",
        properties: {
          booking_id: {
            type: "number",
            description: "ID of the booking to cancel",
          },
          reason: {
            type: "string",
            description:
              "Cancellation reason (e.g., 'Client requested cancellation', 'Rescheduling')",
          },
          notify_client: {
            type: "boolean",
            description:
              "If true, attempts to notify the client via SMS/WhatsApp (requires additional configuration)",
          },
        },
        required: ["booking_id"],
      },
    };
  }
}
