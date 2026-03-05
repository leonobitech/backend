import {
  listByDateSchema,
  type ListByDateInput,
  type ListByDateResponse,
  type BookingSummary,
} from "./consultar-turnos-dia.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

export class AppointmentListByDateTool
  implements ITool<ListByDateInput, ListByDateResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<ListByDateResponse> {
    const params = listByDateSchema.parse(input);

    logger.info(
      { fecha: params.date, estado: params.state },
      "[ConsultarTurnosDia] Fetching appointments"
    );

    // Build search domain
    const fechaInicio = `${params.date} 00:00:00`;
    const fechaFin = `${params.date} 23:59:59`;

    const domain: any[] = [
      ["scheduled_datetime", ">=", fechaInicio],
      ["scheduled_datetime", "<=", fechaFin],
    ];

    // Filter by state if not "all"
    if (params.state && params.state !== "all") {
      domain.push(["state", "=", params.state]);
    }
    if (params.worker) {
      domain.push(["worker", "=", params.worker]);
    }

    const turnos = await this.odooClient.search("appointment.booking", domain, {
      fields: [
        "id",
        "client_name",
        "phone",
        "service_type",
        "scheduled_datetime",
        "duration_hours",
        "total_price",
        "deposit_paid",
        "worker",
        "state",
      ],
      order: "scheduled_datetime asc",
    });

    logger.info(
      { fecha: params.date, count: turnos.length },
      "[ConsultarTurnosDia] Appointments found"
    );

    // Process bookings for response
    const turnosResumen: BookingSummary[] = turnos.map((turno: any) => {
      // Extract time from scheduled_datetime
      const fechaHora = turno.scheduled_datetime || "";
      const hora = fechaHora.includes(" ")
        ? fechaHora.split(" ")[1].substring(0, 5)
        : fechaHora.substring(11, 16);

      return {
        id: turno.id,
        client_name: turno.client_name,
        phone: turno.phone,
        service_type: turno.service_type,
        time: hora,
        duration_hours: turno.duration_hours,
        total_price: turno.total_price,
        deposit_paid: turno.deposit_paid,
        worker: turno.worker || "primary",
        state: turno.state,
      };
    });

    // Calculate summary
    const resumen = {
      pending_payment: turnos.filter((t: any) => t.state === "pending_payment")
        .length,
      confirmed: turnos.filter((t: any) => t.state === "confirmed").length,
      completed: turnos.filter((t: any) => t.state === "completed").length,
      cancelled: turnos.filter((t: any) => t.state === "cancelled").length,
      expected_revenue: turnos
        .filter((t: any) => t.state !== "cancelled")
        .reduce((sum: number, t: any) => sum + (t.total_price || 0), 0),
    };

    return {
      date: params.date,
      total_bookings: turnos.length,
      bookings: turnosResumen,
      summary: resumen,
    };
  }

  definition(): ToolDefinition {
    return {
      name: "appointment_list_by_date",
      description:
        "List all bookings for a specific date in the appointment system. " +
        "Shows a summary with booking counts by state and expected revenue. " +
        "Can filter by state (pending_payment, confirmed, completed, cancelled).",
      inputSchema: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date to query in YYYY-MM-DD format (e.g., 2025-01-15)",
          },
          state: {
            type: "string",
            enum: [
              "pending_payment",
              "confirmed",
              "completed",
              "cancelled",
              "all",
            ],
            description:
              "Filter by specific state. Default: all states.",
          },
          worker: {
            type: "string",
            enum: ["primary", "secondary"],
            description: "Filter by specific worker (optional)",
          },
        },
        required: ["date"],
      },
    };
  }
}
