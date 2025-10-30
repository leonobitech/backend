/**
 * Tool: odoo_complete_activity
 *
 * Marca una actividad como completada y opcionalmente crea un follow-up.
 *
 * @module tools/odoo/activities/complete-activity
 */

import {
  completeActivitySchema,
  type CompleteActivityInput,
  type CompleteActivityResponse
} from "./complete-activity.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

export class CompleteActivityTool implements ITool<CompleteActivityInput, CompleteActivityResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<CompleteActivityResponse> {
    const params = completeActivitySchema.parse(input);

    // Si solo tenemos opportunityId, buscar la actividad más reciente
    let activityId = params.activityId;

    if (!activityId && params.opportunityId) {
      const activities = await this.odooClient.search(
        "mail.activity",
        [
          ["res_model", "=", "crm.lead"],
          ["res_id", "=", params.opportunityId]
        ],
        {
          fields: ["id"],
          limit: 1,
          order: "date_deadline asc"
        }
      );

      if (activities.length === 0) {
        throw new Error(`No activities found for opportunity #${params.opportunityId}`);
      }

      activityId = activities[0].id;
    }

    if (!activityId) {
      throw new Error("Could not determine activity ID");
    }

    // Marcar como completada (action_done)
    await this.odooClient.execute_kw(
      "mail.activity",
      "action_done",
      [[activityId]],
      {
        feedback: params.feedback || "Actividad completada exitosamente"
      }
    );

    // Obtener info de la actividad para el chatter
    const activity = await this.odooClient.read("mail.activity", [activityId], [
      "summary",
      "res_id",
      "res_model"
    ]);

    const opportunityId = activity[0].res_id;

    // Registrar en el chatter
    await this.odooClient.postMessageToChatter({
      model: "crm.lead",
      resId: opportunityId,
      body: `
        <p>✅ <strong>Actividad completada</strong></p>
        <p><strong>Actividad:</strong> ${activity[0].summary}</p>
        ${params.feedback ? `<p><strong>Notas:</strong> ${params.feedback}</p>` : ''}
        <p><em>Sistema automatizado Leonobitech</em></p>
      `,
      messageType: "comment"
    });

    // Crear follow-up si se solicitó
    let followUpCreated = false;
    let followUpActivityId: number | undefined;

    if (params.createFollowUp) {
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + (params.followUpDays || 2));
      const deadline = followUpDate.toISOString().split('T')[0];

      followUpActivityId = await this.odooClient.createActivity({
        activityType: "call",
        summary: `Follow-up: ${activity[0].summary}`,
        resModel: "crm.lead",
        resId: opportunityId,
        dateDeadline: deadline,
        note: "Hacer seguimiento después de la reunión anterior"
      });

      followUpCreated = true;

      // Log del follow-up
      await this.odooClient.postMessageToChatter({
        model: "crm.lead",
        resId: opportunityId,
        body: `
          <p>📞 <strong>Follow-up programado</strong></p>
          <p>Se ha creado una actividad de seguimiento para dentro de ${params.followUpDays} días.</p>
          <p><em>Sistema automatizado Leonobitech</em></p>
        `,
        messageType: "comment"
      });
    }

    return {
      success: true,
      activityId,
      message: `Activity completed successfully${followUpCreated ? ' and follow-up created' : ''}`,
      followUpCreated,
      followUpActivityId
    };
  }

  definition(): ToolDefinition {
    return {
      name: "odoo_complete_activity",
      description: "Mark an activity as completed (Done) and optionally create a follow-up task. Use after meetings/calls are finished.",
      inputSchema: {
        type: "object",
        properties: {
          activityId: {
            type: "number",
            description: "ID of the activity to complete (optional if opportunityId is provided)"
          },
          opportunityId: {
            type: "number",
            description: "ID of the opportunity - will complete the most recent activity (optional if activityId is provided)"
          },
          feedback: {
            type: "string",
            description: "Feedback/notes about the completed activity (optional)"
          },
          createFollowUp: {
            type: "boolean",
            description: "Whether to create a follow-up call activity (default: false)"
          },
          followUpDays: {
            type: "number",
            description: "Days until follow-up deadline (default: 2)"
          }
        }
      }
    };
  }
}
