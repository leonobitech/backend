import {
  cancelarTurnoSchema,
  type CancelarTurnoInput,
  type CancelarTurnoResponse,
} from "./cancelar-turno.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

export class CancelarTurnoTool
  implements ITool<CancelarTurnoInput, CancelarTurnoResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<CancelarTurnoResponse> {
    const params = cancelarTurnoSchema.parse(input);

    logger.info(
      { turnoId: params.turno_id, motivo: params.motivo },
      "[CancelarTurno] Cancelling appointment"
    );

    // Obtener datos actuales del turno
    const turnos = await this.odooClient.read("salon.turno", [params.turno_id], [
      "clienta",
      "telefono",
      "servicio",
      "fecha_hora",
      "estado",
      "sena_pagada",
    ]);

    if (turnos.length === 0) {
      throw new Error(`Turno #${params.turno_id} no encontrado`);
    }

    const turno = turnos[0];
    const estadoAnterior = turno.estado;

    // Verificar que el turno no esté ya cancelado o completado
    if (estadoAnterior === "cancelado") {
      throw new Error(`El turno #${params.turno_id} ya está cancelado`);
    }
    if (estadoAnterior === "completado") {
      throw new Error(`El turno #${params.turno_id} ya fue completado y no puede cancelarse`);
    }

    // Cancelar el turno
    await this.odooClient.write("salon.turno", [params.turno_id], {
      estado: "cancelado",
    });

    // Agregar nota con el motivo
    const motivoMsg = params.motivo
      ? `Motivo: ${params.motivo}`
      : "Sin motivo especificado";

    // Usar api_post_message (Python Markup()) para evitar doble-escape HTML via XML-RPC
    await this.odooClient.execute(
      "salon.turno",
      "api_post_message",
      [params.turno_id,
        `<strong>Turno cancelado</strong><br/>${motivoMsg}`
      ]
    );

    // TODO: Si notificar_clienta es true, enviar SMS/WhatsApp
    if (params.notificar_clienta) {
      logger.info(
        { turnoId: params.turno_id, telefono: turno.telefono },
        "[CancelarTurno] Client notification requested (not implemented)"
      );
      // Aquí se podría integrar con Twilio/WhatsApp Business API
    }

    logger.info(
      { turnoId: params.turno_id, estadoAnterior, estadoNuevo: "cancelado" },
      "[CancelarTurno] Appointment cancelled"
    );

    // Mensaje de advertencia si ya había pagado la seña
    let message = `Turno de ${turno.clienta} cancelado.`;
    if (turno.sena_pagada) {
      message += " ATENCIÓN: La clienta ya había pagado la seña. Considerar reembolso.";
    }

    return {
      turnoId: params.turno_id,
      clienta: turno.clienta,
      telefono: turno.telefono,
      estado_anterior: estadoAnterior,
      estado_nuevo: "cancelado",
      fecha_hora: turno.fecha_hora,
      servicio: turno.servicio,
      sena_pagada: turno.sena_pagada,
      message,
    };
  }

  definition(): ToolDefinition {
    return {
      name: "leraysi_cancelar_turno",
      description:
        "Cancelar un turno existente en Estilos Leraysi. " +
        "Permite especificar un motivo de cancelación. " +
        "Si la clienta ya pagó la seña, muestra una advertencia para considerar reembolso.",
      inputSchema: {
        type: "object",
        properties: {
          turno_id: {
            type: "number",
            description: "ID del turno a cancelar",
          },
          motivo: {
            type: "string",
            description:
              "Motivo de la cancelación (ej: 'Clienta solicitó cancelación', 'Reprogramación')",
          },
          notificar_clienta: {
            type: "boolean",
            description:
              "Si es true, intenta notificar a la clienta por SMS/WhatsApp (requiere configuración adicional)",
          },
        },
        required: ["turno_id"],
      },
    };
  }
}
