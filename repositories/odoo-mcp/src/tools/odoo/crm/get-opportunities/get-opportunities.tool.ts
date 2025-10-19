import { getOpportunitiesSchema, type GetOpportunitiesInput, type GetOpportunitiesResponse } from "./get-opportunities.schema";
import type { OdooClient } from "@/adapters/out/external/odoo/OdooClient";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

export class GetOpportunitiesTool implements ITool<GetOpportunitiesInput, GetOpportunitiesResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<GetOpportunitiesResponse> {
    const params = getOpportunitiesSchema.parse(input);

    const domain: any[] = [["type", "=", "opportunity"]];

    if (params.stage) {
      domain.push(["stage_id.name", "ilike", params.stage]);
    }

    if (params.minAmount) {
      domain.push(["expected_revenue", ">=", params.minAmount]);
    }

    const opportunities = await this.odooClient.search("crm.lead", domain, {
      fields: [
        "id", "name", "partner_name", "partner_id", "expected_revenue",
        "probability", "stage_id", "user_id", "team_id", "date_deadline",
        "date_closed", "create_date"
      ],
      limit: params.limit,
      order: "expected_revenue desc"
    });

    const totalRevenue = opportunities.reduce((sum, opp) => sum + (opp.expected_revenue || 0), 0);

    return { opportunities, totalRevenue };
  }

  definition(): ToolDefinition {
    return {
      name: "odoo_get_opportunities",
      description: "Get opportunities from Odoo CRM pipeline with revenue and stage information",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of opportunities to return (default: 20, max: 100)"
          },
          stage: {
            type: "string",
            description: "Filter by stage name"
          },
          minAmount: {
            type: "number",
            description: "Minimum expected revenue to filter by"
          }
        }
      }
    };
  }
}
