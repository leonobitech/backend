import { sendEmailSchema, type SendEmailInput, type SendEmailResponse } from "./send-email.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { getEmailTemplate } from "@/prompts/email-templates";

export class SendEmailTool implements ITool<SendEmailInput, SendEmailResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  /**
   * Parse price from string format to number
   * Examples:
   *   "USD $1,200" → 1200
   *   "$3,500" → 3500
   *   "1200" → 1200
   */
  private parsePrice(priceString: string): number | null {
    if (!priceString) return null;

    // Remove currency symbols, spaces, and commas
    const cleaned = priceString.replace(/[USD\$,\s]/gi, '').trim();

    // Parse to number
    const parsed = parseFloat(cleaned);

    return isNaN(parsed) ? null : parsed;
  }

  async execute(input: unknown): Promise<SendEmailResponse> {
    const params = sendEmailSchema.parse(input);

    // Determine email body: use template if specified, otherwise use provided body
    let emailBody: string;
    let templateUsed: string | undefined;

    if (params.templateType && params.templateType !== 'custom') {
      // Use template
      emailBody = getEmailTemplate(params.templateType, params.templateData || {});
      templateUsed = params.templateType;
    } else if (params.body) {
      // Use custom body
      emailBody = params.body;
      templateUsed = 'custom';
    } else {
      throw new Error('Either templateType or body must be provided');
    }

    // Require subject - LLM should generate contextual subject line
    if (!params.subject) {
      throw new Error('Subject is required. LLM must provide contextual subject line based on conversation context.');
    }

    // IMPORTANTE: Solo crear y vincular contacto cuando se envía propuesta o demo
    // Esto mueve la oportunidad de "Qualified" → "Proposition"
    if (params.templateType === 'proposal' || params.templateType === 'demo') {
      await this.odooClient.ensureOpportunityHasPartner(params.opportunityId);
    }

    const result = await this.odooClient.sendEmailToOpportunity({
      opportunityId: params.opportunityId,
      subject: params.subject,
      body: emailBody,
      emailTo: params.emailTo,
      templateType: templateUsed // Pasar templateType para correcta progresión de stage
    });

    // Update opportunity price when sending proposal
    if (params.templateType === 'proposal' && params.templateData?.price) {
      const priceValue = this.parsePrice(params.templateData.price);

      if (priceValue !== null && priceValue > 0) {
        try {
          // Update expected_revenue field in the opportunity
          await this.odooClient.write('crm.lead', [params.opportunityId], {
            expected_revenue: priceValue
          });

          console.log(`[SendEmailTool] Updated opportunity #${params.opportunityId} expected_revenue: ${priceValue}`);
        } catch (error) {
          // Log error but don't fail the entire operation
          console.error(`[SendEmailTool] Failed to update price for opportunity #${params.opportunityId}:`, error);
        }
      } else {
        console.warn(`[SendEmailTool] Could not parse price "${params.templateData.price}" - skipping price update`);
      }
    }

    const queueStatus = result.queueProcessed ? "Email queued for immediate delivery" : "Email enqueued; Odoo cron will deliver";

    return {
      mailId: result.mailId,
      message: `Email sent successfully to opportunity #${params.opportunityId}. ${queueStatus}.${templateUsed ? ` Template used: ${templateUsed}` : ''}`,
      recipient: result.recipientEmail,
      queueProcessed: result.queueProcessed,
      templateUsed
    };
  }

  definition(): ToolDefinition {
    return {
      name: "odoo_send_email",
      description: "Send a professional email to an opportunity's contact in Odoo CRM. Supports pre-designed HTML templates (proposal, demo, followup, welcome) or custom HTML/text content.",
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
            description: "Email body content (HTML or plain text). Optional if using templateType."
          },
          emailTo: {
            type: "string",
            description: "Override recipient email address (optional)"
          },
          templateType: {
            type: "string",
            enum: ["proposal", "demo", "followup", "welcome", "custom"],
            description: "Use a professional HTML template. Options: 'proposal' (commercial proposal), 'demo' (demo confirmation), 'followup' (follow-up email), 'welcome' (first contact), 'custom' (use body field)"
          },
          templateData: {
            type: "object",
            description: "Data to populate the template (only used when templateType is set)",
            properties: {
              customerName: { type: "string", description: "Customer's name" },
              opportunityName: { type: "string", description: "Opportunity name" },
              companyName: { type: "string", description: "Company name" },
              senderName: { type: "string", description: "Sender's name (default: 'Equipo Leonobitech')" },
              productName: { type: "string", description: "Product/service name" },
              price: { type: "string", description: "Price (e.g., 'USD $3,000')" },
              demoDate: { type: "string", description: "Demo date (e.g., '31 de Octubre, 2025')" },
              demoTime: { type: "string", description: "Demo time (e.g., '10:00 AM')" },
              meetingLink: { type: "string", description: "Meeting link URL" },
              customContent: { type: "string", description: "Custom HTML content to include in template" }
            }
          }
        },
        required: ["opportunityId", "subject"]
      }
    };
  }
}
