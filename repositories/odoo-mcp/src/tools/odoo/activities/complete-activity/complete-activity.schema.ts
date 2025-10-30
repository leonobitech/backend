import { z } from "zod";

export const completeActivitySchema = z.object({
  activityId: z.number().int().positive().optional(),
  opportunityId: z.number().int().positive().optional(),
  feedback: z.string().optional(),
  createFollowUp: z.boolean().optional().default(false),
  followUpDays: z.number().int().positive().optional().default(2),
}).refine(
  (data) => data.activityId || data.opportunityId,
  {
    message: "Either activityId or opportunityId must be provided"
  }
);

export type CompleteActivityInput = z.infer<typeof completeActivitySchema>;

export interface CompleteActivityResponse {
  success: boolean;
  activityId: number;
  message: string;
  followUpCreated?: boolean;
  followUpActivityId?: number;
}
