import { z } from "zod";

export const scheduleMeetingSchema = z.object({
  opportunityId: z.number().int().positive(),
  title: z.string().min(1),
  startDatetime: z.string(), // ISO format
  durationHours: z.number().positive().optional().default(1),
  description: z.string().optional(),
  location: z.string().optional(),
  forceSchedule: z.boolean().optional().default(false),
});

export type ScheduleMeetingInput = z.infer<typeof scheduleMeetingSchema>;

export interface ScheduleMeetingResponse {
  eventId?: number;
  message: string;
  conflict?: {
    conflicts: any[];
    availableSlots: Array<{ start: string; end: string }>;
  };
}
