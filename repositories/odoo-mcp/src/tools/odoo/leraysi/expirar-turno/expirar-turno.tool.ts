import {
  expirarTurnoSchema,
  type ExpirarTurnoInput,
  type ExpirarTurnoResponse,
} from "./expirar-turno.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

export class ExpirarTurnoTool
  implements ITool<ExpirarTurnoInput, ExpirarTurnoResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<ExpirarTurnoResponse> {
    const params = expirarTurnoSchema.parse(input);

    logger.info(
      { turnoId: params.turno_id },
      "[ExpirarTurno] Processing expired appointment"
    );

    // 1. Leer turno actual (incluir pending_changes para auto-detectar tipo)
    const turnos = await this.odooClient.read(
      "salon.turno",
      [params.turno_id],
      ["clienta", "estado", "lead_id", "pending_changes"]
    );

    if (turnos.length === 0) {
      throw new Error(`Turno #${params.turno_id} no encontrado`);
    }

    const turno = turnos[0];
    const estadoAnterior = turno.estado;

    if (estadoAnterior === "cancelado" || estadoAnterior === "completado") {
      return {
        turnoId: params.turno_id,
        clienta: turno.clienta,
        estado_anterior: estadoAnterior,
        estado_nuevo: estadoAnterior,
        lead_reverted: false,
        lead_id: null,
        message: `Turno #${params.turno_id} ya esta ${estadoAnterior}, no se modifica.`,
      };
    }

    // AUTO-DETECT: Si tiene pending_changes, es un servicio agregado que expiró.
    // Revertir a confirmado en vez de cancelar (el turno original sigue vigente).
    if (turno.pending_changes) {
      await this.odooClient.execute(
        "salon.turno",
        "api_revertir_servicio_agregado",
        [params.turno_id]
      );

      logger.info(
        { turnoId: params.turno_id, estadoAnterior },
        "[ExpirarTurno] Service addition reverted (pending_changes detected)"
      );

      return {
        turnoId: params.turno_id,
        clienta: turno.clienta,
        estado_anterior: estadoAnterior,
        estado_nuevo: "confirmado",
        lead_reverted: false,
        lead_id: turno.lead_id ? turno.lead_id[0] : null,
        message: `Servicio agregado de ${turno.clienta} expirado. Turno original mantenido como confirmado.`,
      };
    }

    // CASO NORMAL: Turno nuevo sin pagar → cancelar completamente

    // 2. Cancelar turno en Odoo
    await this.odooClient.write("salon.turno", [params.turno_id], {
      estado: "cancelado",
    });

    // 3. Registrar motivo
    // Usar api_post_message (Python Markup()) para evitar doble-escape HTML via XML-RPC
    await this.odooClient.execute(
      "salon.turno",
      "api_post_message",
      [params.turno_id,
        `<strong>Turno expirado</strong><br/>` +
        `El link de pago expiró sin completar el pago. Slot liberado automáticamente.`
      ]
    );

    // 4. Revertir CRM lead si existe
    let leadReverted = false;
    const leadId = turno.lead_id ? turno.lead_id[0] : null;

    if (leadId) {
      try {
        // Buscar stage "Qualified" (Calificado)
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
            { turnoId: params.turno_id, leadId, stageId: qualifiedStageId },
            "[ExpirarTurno] CRM lead reverted to Qualified"
          );
        }
      } catch (err) {
        logger.warn(
          { turnoId: params.turno_id, leadId, error: String(err) },
          "[ExpirarTurno] Failed to revert CRM lead, continuing"
        );
      }
    }

    logger.info(
      { turnoId: params.turno_id, estadoAnterior, leadReverted },
      "[ExpirarTurno] Appointment expired successfully"
    );

    return {
      turnoId: params.turno_id,
      clienta: turno.clienta,
      estado_anterior: estadoAnterior,
      estado_nuevo: "cancelado",
      lead_reverted: leadReverted,
      lead_id: leadId,
      message: `Turno de ${turno.clienta} expirado. ${leadReverted ? "CRM lead revertido a Qualified." : ""}`,
    };
  }

  definition(): ToolDefinition {
    return {
      name: "leraysi_expirar_turno",
      description:
        "Expirar un turno con pago pendiente vencido. " +
        "Cancela el turno en Odoo, revierte el CRM lead a Qualified, " +
        "y limpia el expected_revenue. Usado por el cron de expiracion.",
      inputSchema: {
        type: "object",
        properties: {
          turno_id: {
            type: "number",
            description: "ID del turno en Odoo (salon.turno) a expirar",
          },
        },
        required: ["turno_id"],
      },
    };
  }
}
