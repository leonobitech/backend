/**
 * Email Templates for Odoo CRM
 *
 * Professional HTML email templates that can be used with odoo_send_email tool.
 * These templates are exposed as MCP prompts for easy access by Claude.
 */

export interface EmailTemplateData {
  customerName?: string;
  opportunityName?: string;
  companyName?: string;
  senderName?: string;
  productName?: string;
  price?: string;
  demoDate?: string;
  demoTime?: string;
  meetingLink?: string;
  customContent?: string;
  [key: string]: any;
}

/**
 * Base template structure
 */
const baseEmailTemplate = (content: string) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Leonobitech</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Leonobitech</h1>
              <p style="margin: 10px 0 0 0; color: #e0e7ff; font-size: 14px;">Automatización Inteligente con IA</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="margin: 0 0 10px 0; color: #6c757d; font-size: 14px;">
                <strong>Leonobitech</strong><br>
                Potenciando negocios con IA
              </p>
              <p style="margin: 0; color: #adb5bd; font-size: 12px;">
                📧 felix@leonobitech.com | 🌐 <a href="https://leonobitech.com" style="color: #667eea; text-decoration: none;">leonobitech.com</a>
              </p>
              <p style="margin: 15px 0 0 0; color: #adb5bd; font-size: 11px;">
                © ${new Date().getFullYear()} Leonobitech. Todos los derechos reservados.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

/**
 * Template: Commercial Proposal
 */
export const commercialProposalTemplate = (data: EmailTemplateData) => {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Hola ${data.customerName || 'estimado cliente'},</h2>

    <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Gracias por tu interés en <strong>${data.productName || 'nuestros servicios de automatización'}</strong>.
      Nos complace presentarte nuestra propuesta comercial personalizada.
    </p>

    <!-- Proposal Box -->
    <div style="background-color: #f0f9ff; border-left: 4px solid #667eea; padding: 20px; margin: 25px 0; border-radius: 4px;">
      <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">📋 Propuesta Comercial</h3>
      <table width="100%" style="border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #4b5563; font-size: 14px;"><strong>Servicio:</strong></td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">${data.productName || 'Sistema de Automatización'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #4b5563; font-size: 14px;"><strong>Inversión:</strong></td>
          <td style="padding: 8px 0; color: #667eea; font-size: 18px; font-weight: 600; text-align: right;">${data.price || 'USD $3,000'}</td>
        </tr>
      </table>
    </div>

    ${data.customContent || `
    <h3 style="margin: 30px 0 15px 0; color: #1f2937; font-size: 18px;">✨ Beneficios Incluidos</h3>
    <ul style="color: #4b5563; font-size: 15px; line-height: 1.8; padding-left: 20px;">
      <li>Implementación completa del sistema</li>
      <li>Capacitación del equipo</li>
      <li>Soporte técnico por 30 días</li>
      <li>Integraciones con tus herramientas actuales</li>
    </ul>
    `}

    <p style="margin: 25px 0 0 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      ¿Te gustaría agendar una demo para ver el sistema en acción? Estoy a tu disposición para cualquier consulta.
    </p>

    <div style="margin: 30px 0 0 0; text-align: center;">
      <a href="mailto:felix@leonobitech.com" style="display: inline-block; background-color: #667eea; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        📧 Responder Propuesta
      </a>
    </div>

    <p style="margin: 25px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
      Saludos cordiales,<br>
      <strong>${data.senderName || 'Equipo Leonobitech'}</strong>
    </p>
  `;

  return baseEmailTemplate(content);
};

/**
 * Template: Demo Confirmation
 */
export const demoConfirmationTemplate = (data: EmailTemplateData) => {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">¡Demo Confirmada! 🎉</h2>

    <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hola ${data.customerName || 'estimado cliente'},
    </p>

    <p style="margin: 0 0 25px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Tu demo ha sido agendada exitosamente. ¡Estamos emocionados de mostrarte cómo podemos transformar tu negocio!
    </p>

    <!-- Meeting Details Box -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; margin: 25px 0; border-radius: 8px; color: #ffffff;">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">📅 Detalles de la Reunión</h3>
      <table width="100%" style="border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; font-size: 14px; opacity: 0.9;">📆 Fecha:</td>
          <td style="padding: 10px 0; font-size: 15px; font-weight: 600; text-align: right;">${data.demoDate || 'Por confirmar'}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; font-size: 14px; opacity: 0.9;">⏰ Hora:</td>
          <td style="padding: 10px 0; font-size: 15px; font-weight: 600; text-align: right;">${data.demoTime || 'Por confirmar'}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; font-size: 14px; opacity: 0.9;">⏱️ Duración:</td>
          <td style="padding: 10px 0; font-size: 15px; font-weight: 600; text-align: right;">1 hora</td>
        </tr>
      </table>

      ${data.meetingLink ? `
      <div style="margin: 20px 0 0 0; text-align: center;">
        <a href="${data.meetingLink}" style="display: inline-block; background-color: #ffffff; color: #667eea; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
          🎥 Unirse a la Demo
        </a>
      </div>
      ` : ''}
    </div>

    <h3 style="margin: 30px 0 15px 0; color: #1f2937; font-size: 18px;">📋 Agenda de la Demo</h3>
    <ul style="color: #4b5563; font-size: 15px; line-height: 1.8; padding-left: 20px;">
      <li>Presentación de la plataforma (10 min)</li>
      <li>Demostración en vivo de funcionalidades (30 min)</li>
      <li>Casos de uso específicos para tu negocio (10 min)</li>
      <li>Sesión de preguntas y respuestas (10 min)</li>
    </ul>

    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="margin: 0; color: #78350f; font-size: 14px;">
        💡 <strong>Tip:</strong> Prepara tus preguntas y casos de uso específicos para aprovechar al máximo la demo.
      </p>
    </div>

    <p style="margin: 25px 0 0 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Nos vemos pronto,<br>
      <strong>${data.senderName || 'Equipo Leonobitech'}</strong>
    </p>
  `;

  return baseEmailTemplate(content);
};

/**
 * Template: Follow-up
 */
export const followUpTemplate = (data: EmailTemplateData) => {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Seguimiento de tu consulta</h2>

    <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hola ${data.customerName || 'estimado cliente'},
    </p>

    <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Quería hacer un seguimiento de nuestra última conversación sobre <strong>${data.productName || 'nuestros servicios'}</strong>.
    </p>

    ${data.customContent || `
    <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      ¿Hay algo más en lo que pueda ayudarte? Estoy aquí para resolver cualquier duda que tengas.
    </p>
    `}

    <div style="background-color: #f0f9ff; border-left: 4px solid #667eea; padding: 20px; margin: 25px 0; border-radius: 4px;">
      <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 16px;">¿Cómo podemos ayudarte?</h3>
      <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 15px; line-height: 1.8;">
        <li>Agendar una demo personalizada</li>
        <li>Responder tus preguntas técnicas</li>
        <li>Preparar una propuesta a medida</li>
        <li>Conectarte con nuestro equipo técnico</li>
      </ul>
    </div>

    <p style="margin: 25px 0 0 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Quedo atento a tus comentarios,<br>
      <strong>${data.senderName || 'Equipo Leonobitech'}</strong>
    </p>
  `;

  return baseEmailTemplate(content);
};

/**
 * Template: Welcome/First Contact
 */
export const welcomeTemplate = (data: EmailTemplateData) => {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">¡Bienvenido a Leonobitech! 👋</h2>

    <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hola ${data.customerName || 'estimado cliente'},
    </p>

    <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Gracias por contactarnos. En Leonobitech, ayudamos a empresas como la tuya a automatizar procesos y potenciar su negocio con Inteligencia Artificial.
    </p>

    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; margin: 25px 0; border-radius: 8px; color: #ffffff; text-align: center;">
      <h3 style="margin: 0 0 15px 0; font-size: 20px;">🚀 Nuestros Servicios</h3>
    </div>

    <table width="100%" style="margin: 20px 0;">
      <tr>
        <td style="padding: 15px; vertical-align: top;">
          <div style="font-size: 32px; margin-bottom: 10px;">💬</div>
          <h4 style="margin: 0 0 8px 0; color: #1f2937; font-size: 16px;">WhatsApp Chatbot</h4>
          <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">Automatiza atención al cliente 24/7</p>
        </td>
        <td style="padding: 15px; vertical-align: top;">
          <div style="font-size: 32px; margin-bottom: 10px;">📞</div>
          <h4 style="margin: 0 0 8px 0; color: #1f2937; font-size: 16px;">Voice Assistant (IVR)</h4>
          <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">Asistente de voz inteligente</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 15px; vertical-align: top;">
          <div style="font-size: 32px; margin-bottom: 10px;">🧠</div>
          <h4 style="margin: 0 0 8px 0; color: #1f2937; font-size: 16px;">Knowledge Base Agent</h4>
          <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">Base de conocimiento con IA</p>
        </td>
        <td style="padding: 15px; vertical-align: top;">
          <div style="font-size: 32px; margin-bottom: 10px;">⚙️</div>
          <h4 style="margin: 0 0 8px 0; color: #1f2937; font-size: 16px;">Process Automation</h4>
          <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">Automatización con Odoo/ERP</p>
        </td>
      </tr>
    </table>

    <div style="margin: 30px 0 0 0; text-align: center;">
      <a href="mailto:felix@leonobitech.com" style="display: inline-block; background-color: #667eea; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; margin-right: 10px;">
        📧 Contactar
      </a>
      <a href="https://leonobitech.com" style="display: inline-block; background-color: #f3f4f6; color: #1f2937; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        🌐 Visitar Web
      </a>
    </div>

    <p style="margin: 30px 0 0 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      ¿Listo para transformar tu negocio?<br>
      <strong>${data.senderName || 'Equipo Leonobitech'}</strong>
    </p>
  `;

  return baseEmailTemplate(content);
};

/**
 * Get template by type
 */
export function getEmailTemplate(type: string, data: EmailTemplateData = {}): string {
  switch (type.toLowerCase()) {
    case 'proposal':
    case 'commercial':
    case 'propuesta':
      return commercialProposalTemplate(data);

    case 'demo':
    case 'demo_confirmation':
    case 'confirmacion_demo':
      return demoConfirmationTemplate(data);

    case 'followup':
    case 'follow_up':
    case 'seguimiento':
      return followUpTemplate(data);

    case 'welcome':
    case 'bienvenida':
    case 'first_contact':
      return welcomeTemplate(data);

    default:
      return commercialProposalTemplate(data);
  }
}

/**
 * List available templates
 */
export const availableTemplates = [
  {
    type: 'proposal',
    name: 'Propuesta Comercial',
    description: 'Template profesional para enviar propuestas comerciales con precios'
  },
  {
    type: 'demo',
    name: 'Confirmación de Demo',
    description: 'Template para confirmar demos agendadas con detalles de reunión'
  },
  {
    type: 'followup',
    name: 'Seguimiento',
    description: 'Template para hacer seguimiento de oportunidades'
  },
  {
    type: 'welcome',
    name: 'Bienvenida',
    description: 'Template de primer contacto presentando servicios de Leonobitech'
  }
];
