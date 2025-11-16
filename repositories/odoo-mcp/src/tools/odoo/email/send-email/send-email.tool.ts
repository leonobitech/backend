import { sendEmailSchema, type SendEmailInput, type SendEmailResponse } from "./send-email.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { getEmailTemplate } from "@/prompts/email-templates";

export class SendEmailTool implements ITool<SendEmailInput, SendEmailResponse> {
  constructor(private readonly odooClient: OdooClient) {}

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

    // Generate subject automatically if not provided and using template
    let emailSubject = params.subject;
    if (!emailSubject && params.templateType) {
      const businessName = params.templateData?.companyName || params.templateData?.customerName || 'tu negocio';
      switch (params.templateType) {
        case 'proposal':
          emailSubject = `Propuesta comercial para ${businessName} - Leonobitech`;
          break;
        case 'demo':
          emailSubject = `Confirmación de demo - ${businessName}`;
          break;
        case 'followup':
          emailSubject = `Seguimiento - ${businessName}`;
          break;
        case 'welcome':
          emailSubject = `Bienvenido/a a Leonobitech`;
          break;
        default:
          emailSubject = `Mensaje de Leonobitech`;
      }
    }

    // IMPORTANTE: Solo crear y vincular contacto cuando se envía propuesta o demo
    // Esto mueve la oportunidad de "Qualified" → "Proposition"
    if (params.templateType === 'proposal' || params.templateType === 'demo') {
      await this.odooClient.ensureOpportunityHasPartner(params.opportunityId);
    }

    const result = await this.odooClient.sendEmailToOpportunity({
      opportunityId: params.opportunityId,
      subject: emailSubject!,
      body: emailBody,
      emailTo: params.emailTo,
      templateType: templateUsed // Pasar templateType para correcta progresión de stage
    });

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
