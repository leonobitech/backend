import {
  consultarDisponibilidadSchema,
  type ConsultarDisponibilidadInput,
  type ConsultarDisponibilidadResponse,
  type TurnoOcupado,
} from "./consultar-disponibilidad.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

export class ConsultarDisponibilidadTool
  implements ITool<ConsultarDisponibilidadInput, ConsultarDisponibilidadResponse>
{
  // Horario de atención del salón
  private readonly HORA_APERTURA = 9;
  private readonly HORA_CIERRE = 19;

  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<ConsultarDisponibilidadResponse> {
    const params = consultarDisponibilidadSchema.parse(input);

    logger.info(
      { fecha: params.fecha, duracion: params.duracion },
      "[ConsultarDisponibilidad] Checking availability"
    );

    // Buscar turnos del día (no cancelados)
    const fechaInicio = `${params.fecha} 00:00:00`;
    const fechaFin = `${params.fecha} 23:59:59`;

    const turnos = await this.odooClient.search("salon.turno", [
      ["fecha_hora", ">=", fechaInicio],
      ["fecha_hora", "<=", fechaFin],
      ["estado", "!=", "cancelado"],
    ], {
      fields: ["id", "clienta", "servicio", "fecha_hora", "fecha_fin", "duracion"],
      order: "fecha_hora asc",
    });

    // Procesar turnos ocupados
    const turnosOcupados: TurnoOcupado[] = turnos.map((turno: any) => {
      const fechaHora = turno.fecha_hora || "";
      const fechaFin = turno.fecha_fin || "";

      const horaInicio = fechaHora.includes(" ")
        ? fechaHora.split(" ")[1].substring(0, 5)
        : fechaHora.substring(11, 16);

      const horaFin = fechaFin
        ? fechaFin.includes(" ")
          ? fechaFin.split(" ")[1].substring(0, 5)
          : fechaFin.substring(11, 16)
        : this.calcularHoraFin(horaInicio, turno.duracion || 1);

      return {
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        servicio: turno.servicio,
        clienta: turno.clienta,
      };
    });

    // Calcular horarios disponibles
    const horariosDisponibles = this.calcularHorariosDisponibles(
      turnosOcupados,
      params.duracion || 1
    );

    const mensaje =
      horariosDisponibles.length > 0
        ? `Hay ${horariosDisponibles.length} horarios disponibles para el ${params.fecha}`
        : `No hay horarios disponibles para el ${params.fecha}`;

    logger.info(
      { fecha: params.fecha, disponibles: horariosDisponibles.length },
      "[ConsultarDisponibilidad] Availability calculated"
    );

    return {
      fecha: params.fecha,
      horario_atencion: {
        apertura: `${this.HORA_APERTURA}:00`,
        cierre: `${this.HORA_CIERRE}:00`,
      },
      turnos_ocupados: turnosOcupados,
      horarios_disponibles: horariosDisponibles,
      mensaje,
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
    turnosOcupados: TurnoOcupado[],
    duracion: number
  ): string[] {
    const disponibles: string[] = [];

    // Generar slots cada 30 minutos
    for (let hora = this.HORA_APERTURA; hora < this.HORA_CIERRE; hora++) {
      for (const minuto of [0, 30]) {
        const slotInicio = `${hora.toString().padStart(2, "0")}:${minuto.toString().padStart(2, "0")}`;
        const slotFin = this.calcularHoraFin(slotInicio, duracion);

        // Verificar que el slot termine antes del cierre
        const [horaFin] = slotFin.split(":").map(Number);
        if (horaFin > this.HORA_CIERRE) continue;

        // Verificar que no se superponga con turnos existentes
        const ocupado = turnosOcupados.some((turno) => {
          return this.haySuperpocision(
            slotInicio,
            slotFin,
            turno.hora_inicio,
            turno.hora_fin
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
    // Convertir a minutos para comparar
    const toMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };

    const s1 = toMinutes(inicio1);
    const e1 = toMinutes(fin1);
    const s2 = toMinutes(inicio2);
    const e2 = toMinutes(fin2);

    // Hay superposición si: inicio1 < fin2 AND fin1 > inicio2
    return s1 < e2 && e1 > s2;
  }

  definition(): ToolDefinition {
    return {
      name: "leraysi_consultar_disponibilidad",
      description:
        "Consultar los horarios disponibles de un día específico en Estilos Leraysi. " +
        "Muestra los turnos ocupados y los slots disponibles considerando la duración del servicio. " +
        "El horario de atención es de 9:00 a 19:00.",
      inputSchema: {
        type: "object",
        properties: {
          fecha: {
            type: "string",
            description: "Fecha a consultar en formato YYYY-MM-DD (ej: 2025-01-15)",
          },
          duracion: {
            type: "number",
            description:
              "Duración del servicio en horas para verificar disponibilidad (default: 1)",
          },
        },
        required: ["fecha"],
      },
    };
  }
}
