import { scheduleMeetingSchema, type ScheduleMeetingInput, type ScheduleMeetingResponse } from "./schedule-meeting.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

export class ScheduleMeetingTool implements ITool<ScheduleMeetingInput, ScheduleMeetingResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<ScheduleMeetingResponse> {
    const params = scheduleMeetingSchema.parse(input);

    // IMPORTANTE: Agendar un demo/reunión es formal, requiere contacto vinculado
    // Esto mueve la oportunidad de "Qualified" → "Proposition"
    await this.odooClient.ensureOpportunityHasPartner(params.opportunityId);

    const result = await this.odooClient.scheduleMeeting({
      name: params.title,
      opportunityId: params.opportunityId,
      start: params.startDatetime,
      duration: params.durationHours,
      description: params.description,
      location: params.location,
      forceSchedule: params.forceSchedule
    });

    if (result.conflict && !result.eventId) {
      return {
        message: "Conflictos detectados al agendar la reunión",
        conflict: {
          conflicts: result.conflict.conflicts,
          availableSlots: result.conflict.availableSlots
        }
      };
    }

    return {
      eventId: result.eventId,
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
