import { updateDealStageSchema, type UpdateDealStageInput, type UpdateDealStageResponse } from "./update-deal-stage.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

export class UpdateDealStageTool implements ITool<UpdateDealStageInput, UpdateDealStageResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<UpdateDealStageResponse> {
    const params = updateDealStageSchema.parse(input);

    const stages = await this.odooClient.search("crm.stage", [["name", "ilike", params.stageName]], {
      fields: ["id", "name"],
      limit: 1
    });

    if (stages.length === 0) {
      throw new Error(`Stage "${params.stageName}" not found`);
    }

    const stageId = stages[0].id;
    await this.odooClient.write("crm.lead", [params.opportunityId], { stage_id: stageId });

    return {
      success: true,
      opportunityId: params.opportunityId,
      newStage: params.stageName
    };
  }

  definition(): ToolDefinition {
    return {
      name: "odoo_update_deal_stage",
      description: "Move an opportunity to a different stage in the pipeline",
      inputSchema: {
        type: "object",
        properties: {
          opportunityId: {
            type: "number",
            description: "ID of the opportunity to update (required)"
          },
          stageName: {
            type: "string",
            description: "Name of the target stage (e.g., 'Won', 'Lost', 'Proposition')"
          }
        },
        required: ["opportunityId", "stageName"]
      }
    };
  }
}
