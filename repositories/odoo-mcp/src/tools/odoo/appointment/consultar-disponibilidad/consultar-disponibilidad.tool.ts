import {
  checkAvailabilitySchema,
  type CheckAvailabilityInput,
  type CheckAvailabilityResponse,
  type OccupiedSlot,
} from "./consultar-disponibilidad.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

export class AppointmentCheckAvailabilityTool
  implements ITool<CheckAvailabilityInput, CheckAvailabilityResponse>
{
  // Business hours
  private readonly HORA_APERTURA = 9;
  private readonly HORA_CIERRE = 19;

  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<CheckAvailabilityResponse> {
    const params = checkAvailabilitySchema.parse(input);

    logger.info(
      { fecha: params.date, duracion: params.duration_hours },
      "[ConsultarDisponibilidad] Checking availability"
    );

    // Search bookings for the day (excluding cancelled)
    const fechaInicio = `${params.date} 00:00:00`;
    const fechaFin = `${params.date} 23:59:59`;

    const domain: any[] = [
      ["scheduled_datetime", ">=", fechaInicio],
      ["scheduled_datetime", "<=", fechaFin],
      ["state", "!=", "cancelled"],
    ];
    if (params.worker) {
      domain.push(["worker", "=", params.worker]);
    }

    const turnos = await this.odooClient.search("appointment.booking", domain, {
      fields: ["id", "client_name", "service_type", "scheduled_datetime", "end_datetime", "duration_hours", "worker"],
      order: "scheduled_datetime asc",
    });

    // Process occupied bookings
    const turnosOcupados: OccupiedSlot[] = turnos.map((turno: any) => {
      const fechaHora = turno.scheduled_datetime || "";
      const fechaFin = turno.end_datetime || "";

      const horaInicio = fechaHora.includes(" ")
        ? fechaHora.split(" ")[1].substring(0, 5)
        : fechaHora.substring(11, 16);

      const horaFin = fechaFin
        ? fechaFin.includes(" ")
          ? fechaFin.split(" ")[1].substring(0, 5)
          : fechaFin.substring(11, 16)
        : this.calcularHoraFin(horaInicio, turno.duration_hours || 1);

      return {
        start_time: horaInicio,
        end_time: horaFin,
        service_type: turno.service_type,
        client_name: turno.client_name,
        worker: turno.worker || "primary",
      };
    });

    // Calculate available time slots
    const horariosDisponibles = this.calcularHorariosDisponibles(
      turnosOcupados,
      params.duration_hours || 1
    );

    const mensaje =
      horariosDisponibles.length > 0
        ? `Hay ${horariosDisponibles.length} horarios disponibles para el ${params.date}`
        : `No hay horarios disponibles para el ${params.date}`;

    logger.info(
      { fecha: params.date, disponibles: horariosDisponibles.length },
      "[ConsultarDisponibilidad] Availability calculated"
    );

    return {
      date: params.date,
      business_hours: {
        open: `${this.HORA_APERTURA}:00`,
        close: `${this.HORA_CIERRE}:00`,
      },
      occupied_slots: turnosOcupados,
      available_slots: horariosDisponibles,
      message: mensaje,
    };
  }

  private calcularHoraFin(horaInicio: string, duracion: number): string {
    const [horas, minutos] = horaInicio.split(":").map(Number);
    const totalMinutos = horas * 60 + minutos + duracion * 60;
    const horaFin = Math.floor(totalMinutos / 60);
    const minutoFin = totalMinutos % 60;
    return `${horaFin.toString().padStart(2, "0")}:${minutoFin.toString().padStart(2, "0")}`;
  }

  private calcularHorariosDisponibles(
    turnosOcupados: OccupiedSlot[],
    duracion: number
  ): string[] {
    const disponibles: string[] = [];

    // Generate slots every 30 minutes
    for (let hora = this.HORA_APERTURA; hora < this.HORA_CIERRE; hora++) {
      for (const minuto of [0, 30]) {
        const slotInicio = `${hora.toString().padStart(2, "0")}:${minuto.toString().padStart(2, "0")}`;
        const slotFin = this.calcularHoraFin(slotInicio, duracion);

        // Verify slot ends before closing time
        const [horaFin] = slotFin.split(":").map(Number);
        if (horaFin > this.HORA_CIERRE) continue;

        // Verify no overlap with existing bookings
        const ocupado = turnosOcupados.some((turno) => {
          return this.haySuperpocision(
            slotInicio,
            slotFin,
            turno.start_time,
            turno.end_time
          );
        });

        if (!ocupado) {
          disponibles.push(slotInicio);
        }
      }
    }

    return disponibles;
  }

  private haySuperpocision(
    inicio1: string,
    fin1: string,
    inicio2: string,
    fin2: string
  ): boolean {
    const toMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };

    const s1 = toMinutes(inicio1);
    const e1 = toMinutes(fin1);
    const s2 = toMinutes(inicio2);
    const e2 = toMinutes(fin2);

    // Overlap if: start1 < end2 AND end1 > start2
    return s1 < e2 && e1 > s2;
  }

  definition(): ToolDefinition {
    return {
      name: "appointment_check_availability",
      description:
        "Check available time slots for a specific date in the appointment system. " +
        "Shows occupied bookings and available slots considering service duration. " +
        "Business hours are 9:00 to 19:00.",
      inputSchema: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date to check in YYYY-MM-DD format (e.g., 2025-01-15)",
          },
          duration: {
            type: "number",
            description:
              "Service duration in hours to verify availability (default: 1)",
          },
          worker: {
            type: "string",
            enum: ["primary", "secondary"],
            description: "Filter availability by specific worker (optional, no filter shows all)",
          },
        },
        required: ["date"],
      },
    };
  }
}
