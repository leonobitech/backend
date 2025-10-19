import { z } from "zod";

export const sendEmailSchema = z.object({
  opportunityId: z.number().int().positive(),
  subject: z.string().min(1),
  body: z.string().min(1),
  emailTo: z.string().email().optional(),
});

export type SendEmailInput = z.infer<typeof sendEmailSchema>;

export interface SendEmailResponse {
  mailId: number;
  message: string;
  recipient: string;
  queueProcessed: boolean;
}
