import {
  consultarTurnosDiaSchema,
  type ConsultarTurnosDiaInput,
  type ConsultarTurnosDiaResponse,
  type TurnoResumen,
} from "./consultar-turnos-dia.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

export class ConsultarTurnosDiaTool
  implements ITool<ConsultarTurnosDiaInput, ConsultarTurnosDiaResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<ConsultarTurnosDiaResponse> {
    const params = consultarTurnosDiaSchema.parse(input);

    logger.info(
      { fecha: params.fecha, estado: params.estado },
      "[ConsultarTurnosDia] Fetching appointments"
    );

    // Construir dominio de búsqueda
    const fechaInicio = `${params.fecha} 00:00:00`;
    const fechaFin = `${params.fecha} 23:59:59`;

    const domain: any[] = [
      ["fecha_hora", ">=", fechaInicio],
      ["fecha_hora", "<=", fechaFin],
    ];

    // Filtrar por estado si no es "todos"
    if (params.estado && params.estado !== "todos") {
      domain.push(["estado", "=", params.estado]);
    }
    if (params.trabajadora) {
      domain.push(["trabajadora", "=", params.trabajadora]);
    }

    const turnos = await this.odooClient.search("salon.turno", domain, {
      fields: [
        "id",
        "clienta",
        "telefono",
        "servicio",
        "fecha_hora",
        "duracion",
        "precio",
        "sena_pagada",
        "trabajadora",
        "estado",
      ],
      order: "fecha_hora asc",
    });

    logger.info(
      { fecha: params.fecha, count: turnos.length },
      "[ConsultarTurnosDia] Appointments found"
    );

    // Procesar turnos para respuesta
    const turnosResumen: TurnoResumen[] = turnos.map((turno: any) => {
      // Extraer hora de fecha_hora
      const fechaHora = turno.fecha_hora || "";
      const hora = fechaHora.includes(" ")
        ? fechaHora.split(" ")[1].substring(0, 5)
        : fechaHora.substring(11, 16);

      return {
        id: turno.id,
        clienta: turno.clienta,
        telefono: turno.telefono,
        servicio: turno.servicio,
        hora,
        duracion: turno.duracion,
        precio: turno.precio,
        sena_pagada: turno.sena_pagada,
        trabajadora: turno.trabajadora || "leraysi",
        estado: turno.estado,
      };
    });

    // Calcular resumen
    const resumen = {
      pendientes_pago: turnos.filter((t: any) => t.estado === "pendiente_pago")
        .length,
      confirmados: turnos.filter((t: any) => t.estado === "confirmado").length,
      completados: turnos.filter((t: any) => t.estado === "completado").length,
      cancelados: turnos.filter((t: any) => t.estado === "cancelado").length,
      ingresos_esperados: turnos
        .filter((t: any) => t.estado !== "cancelado")
        .reduce((sum: number, t: any) => sum + (t.precio || 0), 0),
    };

    return {
      fecha: params.fecha,
      total_turnos: turnos.length,
      turnos: turnosResumen,
      resumen,
    };
  }

  definition(): ToolDefinition {
    return {
      name: "leraysi_consultar_turnos_dia",
      description:
        "Consultar todos los turnos de un día específico en Estilos Leraysi. " +
        "Muestra un resumen con cantidad de turnos por estado e ingresos esperados. " +
        "Puede filtrar por estado (pendiente_pago, confirmado, completado, cancelado).",
      inputSchema: {
        type: "object",
        properties: {
          fecha: {
            type: "string",
            description: "Fecha a consultar en formato YYYY-MM-DD (ej: 2025-01-15)",
          },
          estado: {
            type: "string",
            enum: [
              "pendiente_pago",
              "confirmado",
              "completado",
              "cancelado",
              "todos",
            ],
            description:
              "Filtrar por estado específico. Default: todos los estados.",
          },
          trabajadora: {
            type: "string",
            enum: ["leraysi", "companera"],
            description: "Filtrar por trabajadora específica (opcional)",
          },
        },
        required: ["fecha"],
      },
    };
  }
}
