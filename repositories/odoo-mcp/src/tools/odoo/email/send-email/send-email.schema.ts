import { z } from "zod";

export const sendEmailSchema = z.object({
  opportunityId: z.number().int().positive(),
  subject: z.string().min(1).optional(),  // Optional when using templates
  body: z.string().min(1).optional(),
  emailTo: z.string().email().optional(),

  // Template system
  templateType: z.enum(['proposal', 'demo', 'followup', 'welcome', 'custom']).optional(),
  templateData: z.object({
    customerName: z.string().optional(),
    opportunityName: z.string().optional(),
    companyName: z.string().optional(),
    senderName: z.string().optional(),
    productName: z.string().optional(),
    price: z.string().optional(),
    demoDate: z.string().optional(),
    demoTime: z.string().optional(),
    meetingLink: z.string().optional(),
    customContent: z.string().optional(),
  }).optional(),
});

export type SendEmailInput = z.infer<typeof sendEmailSchema>;

export interface SendEmailResponse {
  mailId: number;
  message: string;
  recipient: string;
  queueProcessed: boolean;
  templateUsed?: string;
}
