import { scheduleMeetingSchema, type ScheduleMeetingInput, type ScheduleMeetingResponse } from "./schedule-meeting.schema";
import type { OdooClient } from "@/adapters/out/external/odoo/OdooClient";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

export class ScheduleMeetingTool implements ITool<ScheduleMeetingInput, ScheduleMeetingResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<ScheduleMeetingResponse> {
    const params = scheduleMeetingSchema.parse(input);

    // Get opportunity info
    const opportunities = await this.odooClient.read("crm.lead", [params.opportunityId], ["partner_id", "user_id"]);

    if (opportunities.length === 0) {
      throw new Error(`Opportunity #${params.opportunityId} not found`);
    }

    const opp = opportunities[0];
    const partnerIds: number[] = [];

    if (opp.partner_id?.[0]) partnerIds.push(opp.partner_id[0]);
    if (opp.user_id?.[0]) {
      const users = await this.odooClient.read("res.users", [opp.user_id[0]], ["partner_id"]);
      if (users[0]?.partner_id?.[0]) partnerIds.push(users[0].partner_id[0]);
    }

    // Calculate end time
    const startDate = new Date(params.startDatetime);
    const endDate = new Date(startDate.getTime() + params.durationHours * 60 * 60 * 1000);

    const eventValues: Record<string, any> = {
      name: params.title,
      start: params.startDatetime,
      stop: endDate.toISOString().replace('T', ' ').substring(0, 19),
      partner_ids: [[6, 0, partnerIds]],
      opportunity_id: params.opportunityId,
    };

    if (params.description) eventValues.description = params.description;
    if (params.location) eventValues.location = params.location;

    const eventId = await this.odooClient.create("calendar.event", eventValues);

    return {
      eventId,
      message: `Meeting "${params.title}" scheduled successfully`
    };
  }

  definition(): ToolDefinition {
    return {
      name: "odoo_schedule_meeting",
      description: "Schedule a meeting in Odoo calendar linked to an opportunity",
      inputSchema: {
        type: "object",
        properties: {
          opportunityId: {
            type: "number",
            description: "ID of the opportunity to link the meeting to (required)"
          },
          title: {
            type: "string",
            description: "Meeting title/name (required)"
          },
          startDatetime: {
            type: "string",
            description: "Start date and time in ISO format YYYY-MM-DD HH:MM:SS (required)"
          },
          durationHours: {
            type: "number",
            description: "Duration in hours (default: 1)"
          },
          description: {
            type: "string",
            description: "Meeting description/agenda (optional)"
          },
          location: {
            type: "string",
            description: "Meeting location (optional)"
          },
          forceSchedule: {
            type: "boolean",
            description: "Force scheduling even if there are calendar conflicts (default: false)"
          }
        },
        required: ["opportunityId", "title", "startDatetime"]
      }
    };
  }
}
