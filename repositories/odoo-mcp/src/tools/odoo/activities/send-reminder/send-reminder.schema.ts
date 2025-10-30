import { z } from "zod";

export const sendReminderSchema = z.object({
  opportunityId: z.number().int().positive(),
  eventId: z.number().int().positive().optional(),
  customMessage: z.string().optional(),
});

export type SendReminderInput = z.infer<typeof sendReminderSchema>;

export interface SendReminderResponse {
  mailId: number;
  message: string;
  recipient: string;
  meetingDetails: {
    title: string;
    date: string;
    location?: string;
  };
}
