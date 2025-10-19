import { sendEmailSchema, type SendEmailInput, type SendEmailResponse } from "./send-email.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

export class SendEmailTool implements ITool<SendEmailInput, SendEmailResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<SendEmailResponse> {
    const params = sendEmailSchema.parse(input);
    const result = await this.odooClient.sendEmailToOpportunity({
      opportunityId: params.opportunityId,
      subject: params.subject,
      body: params.body,
      emailTo: params.emailTo
    });

    const queueStatus = result.queueProcessed ? "Email queued for immediate delivery" : "Email enqueued; Odoo cron will deliver";

    return {
      mailId: result.mailId,
      message: `Email sent successfully to opportunity #${params.opportunityId}. ${queueStatus}.`,
      recipient: result.recipientEmail,
      queueProcessed: result.queueProcessed
    };
  }

  definition(): ToolDefinition {
    return {
      name: "odoo_send_email",
      description: "Send an email to an opportunity's contact in Odoo CRM",
      inputSchema: {
        type: "object",
        properties: {
          opportunityId: {
            type: "number",
            description: "ID of the opportunity to send email to (required)"
          },
          subject: {
            type: "string",
            description: "Email subject line (required)"
          },
          body: {
            type: "string",
            description: "Email body content (can be HTML or plain text) (required)"
          },
          emailTo: {
            type: "string",
            description: "Override recipient email address (optional)"
          }
        },
        required: ["opportunityId", "subject", "body"]
      }
    };
  }
}
