import { sendEmailSchema, type SendEmailInput, type SendEmailResponse } from "./send-email.schema";
import type { OdooClient } from "@/adapters/out/external/odoo/OdooClient";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

export class SendEmailTool implements ITool<SendEmailInput, SendEmailResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<SendEmailResponse> {
    const params = sendEmailSchema.parse(input);

    let recipientEmail = params.emailTo;

    if (!recipientEmail) {
      const opportunities = await this.odooClient.read("crm.lead", [params.opportunityId], ["email_from", "partner_id"]);

      if (opportunities.length === 0) {
        throw new Error(`Opportunity #${params.opportunityId} not found`);
      }

      const opp = opportunities[0];

      if (opp.email_from?.trim()) {
        recipientEmail = opp.email_from.trim();
      } else if (opp.partner_id?.[0]) {
        const partners = await this.odooClient.read("res.partner", [opp.partner_id[0]], ["email"]);
        if (partners[0]?.email) recipientEmail = partners[0].email;
      }

      if (!recipientEmail) {
        throw new Error(`No email found for opportunity #${params.opportunityId}`);
      }
    }

    const mailId = await this.odooClient.create("mail.mail", {
      subject: params.subject,
      body_html: params.body,
      email_to: recipientEmail,
      auto_delete: false,
      model: "crm.lead",
      res_id: params.opportunityId,
    });

    await this.odooClient.execute("mail.mail", "send", [[mailId]]);

    return {
      mailId,
      message: `Email sent successfully to opportunity #${params.opportunityId}`,
      recipient: recipientEmail
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
