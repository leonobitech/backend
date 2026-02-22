import {
  confirmarTurnoSchema,
  type ConfirmarTurnoInput,
  type ConfirmarTurnoResponse,
} from "./confirmar-turno.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

export class ConfirmarTurnoTool
  implements ITool<ConfirmarTurnoInput, ConfirmarTurnoResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<ConfirmarTurnoResponse> {
    const params = confirmarTurnoSchema.parse(input);

    logger.info(
      { turnoId: params.turno_id },
      "[ConfirmarTurno] Confirming appointment"
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

    // Verificar que el turno no esté ya completado o cancelado
    if (estadoAnterior === "completado") {
      throw new Error(`El turno #${params.turno_id} ya está completado`);
    }
    if (estadoAnterior === "cancelado") {
      throw new Error(`El turno #${params.turno_id} está cancelado`);
    }

    // Actualizar el turno a confirmado
    const updateValues: Record<string, any> = {
      estado: "confirmado",
      sena_pagada: true,
    };

    if (params.mp_payment_id) {
      updateValues.mp_payment_id = params.mp_payment_id;
    }

    await this.odooClient.write("salon.turno", [params.turno_id], updateValues);

    // Agregar nota si se proporciona
    if (params.notas) {
      await this.odooClient.execute(
        "salon.turno",
        "message_post",
        [[params.turno_id]],
        {
          body: `<p>Turno confirmado manualmente. ${params.notas}</p>`,
          message_type: "comment",
        }
      );
    }

    logger.info(
      { turnoId: params.turno_id, estadoAnterior, estadoNuevo: "confirmado" },
      "[ConfirmarTurno] Appointment confirmed"
    );

    return {
      turnoId: params.turno_id,
      clienta: turno.clienta,
      estado_anterior: estadoAnterior,
      estado_nuevo: "confirmado",
      fecha_hora: turno.fecha_hora,
      servicio: turno.servicio,
      message: `Turno de ${turno.clienta} confirmado exitosamente. La seña ha sido marcada como pagada.`,
    };
  }

  definition(): ToolDefinition {
    return {
      name: "leraysi_confirmar_turno",
      description:
        "Confirmar un turno después de recibir el pago de la seña en Estilos Leraysi. " +
        "Cambia el estado de 'pendiente_pago' a 'confirmado' y marca la seña como pagada. " +
        "Usar cuando la clienta confirma haber realizado el pago por Mercado Pago o efectivo.",
      inputSchema: {
        type: "object",
        properties: {
          turno_id: {
            type: "number",
            description: "ID del turno a confirmar",
          },
          mp_payment_id: {
            type: "string",
            description:
              "ID del pago de Mercado Pago (opcional, se registra automáticamente por webhook)",
          },
          notas: {
            type: "string",
            description: "Notas adicionales sobre la confirmación (ej: 'Pagó en efectivo')",
          },
        },
        required: ["turno_id"],
      },
    };
  }
}
