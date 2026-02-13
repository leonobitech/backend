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

// ============================================================================
// ESTILOS LERAYSI - TEMPLATES
// ============================================================================

export interface PagoInfo {
  mp_payment_id: string;
  monto: number;
  tipo: string; // 'sena' | 'sena_adicional' | 'saldo'
  descripcion: string;
}

export interface ServicioPagado {
  servicio: string;
  precio: number;
  sena: number;
  mp_payment_id: string;
  esPagoActual: boolean;
  esSenaAdicional: boolean;
}

export interface TurnoConfirmadoData {
  clienta: string;
  servicio: string;
  servicio_detalle?: string | null;
  fecha: string;
  hora: string;
  precio: number;
  sena: number;
  monto_restante: number;
  mp_payment_id: string;
  direccion: string;
  // Detailed payment breakdown (optional, enables new design)
  pagos?: PagoInfo[];
  total_pagado_acumulado?: number;
  pago_actual_mp_id?: string;
}

/**
 * Base template for Estilos Leraysi
 */
const leraysiEmailTemplate = (content: string) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Estilos Leraysi</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #fdf2f8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fdf2f8; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(135, 90, 123, 0.15);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #875A7B 0%, #6B4F6B 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 600;">Estilos Leraysi</h1>
              <p style="margin: 10px 0 0 0; color: #e0d4dd; font-size: 14px;">Salón de Belleza - Buenos Aires</p>
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
            <td style="background-color: #fdf2f8; padding: 30px; text-align: center; border-top: 1px solid #f3e8f0;">
              <p style="margin: 0 0 10px 0; color: #875A7B; font-size: 14px; font-weight: 600;">
                Estilos Leraysi - Salón de Belleza
              </p>
              <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 13px;">
                Yerbal 513, Caballito, Buenos Aires - Argentina
              </p>
              <p style="margin: 15px 0 0 0; color: #d1d5db; font-size: 11px;">
                Este correo fue enviado automáticamente. Por favor no responder a esta dirección.
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

// Base prices for proportional distribution of initial multi-service payments
// Source: SERVICIOS_CONFIG in ParseInput.js
const PRECIOS_BASE_LERAYSI: Record<string, number> = {
  'Corte mujer': 8000,
  'Alisado brasileño': 45000,
  'Alisado con keratina': 55000,
  'Alisado keratina': 55000,
  'Mechas completas': 35000,
  'Tintura raíz': 15000,
  'Tintura completa': 25000,
  'Balayage': 50000,
  'Manicura simple': 5000,
  'Manicura semipermanente': 8000,
  'Pedicura': 6000,
  'Depilación cera piernas': 10000,
  'Depilación cera axilas': 4000,
  'Depilación cera bikini': 6000,
  'Depilación láser piernas': 25000,
  'Depilación láser axilas': 12000,
};

function extractServicesFromDesc(descripcion: string): string[] {
  // "Sena - A + B + C" → ["A", "B", "C"]
  // "Sena Adicional - A + B + C + D" → ["A", "B", "C", "D"]
  const dashIdx = descripcion.indexOf(' - ');
  if (dashIdx === -1) return [descripcion.trim()];
  const servicesPart = descripcion.substring(dashIdx + 3);
  return servicesPart.split(' + ').map(s => s.trim()).filter(Boolean);
}

/**
 * Build per-service breakdown from payment history
 *
 * Algorithm:
 * 1. Diff consecutive payment descriptions to find which service was added
 * 2. Additional payments: precio = monto / 0.3 (exact)
 * 3. Initial payment with multiple services: distribute using base prices proportionally
 */
export function buildServiciosPagados(
  pagos: PagoInfo[],
  pagoActualMpId: string,
  precioTotal: number
): ServicioPagado[] {
  if (!pagos || pagos.length === 0) return [];

  const result: ServicioPagado[] = [];
  let prevServiceSet = new Set<string>();

  // First pass: identify additional services and their prices
  const additionalEntries: { services: string[]; pago: PagoInfo }[] = [];

  for (let i = 0; i < pagos.length; i++) {
    const pago = pagos[i];
    const currentServices = extractServicesFromDesc(pago.descripcion);
    const newServices = currentServices.filter(s => !prevServiceSet.has(s));

    if (i > 0 && newServices.length > 0) {
      additionalEntries.push({ services: newServices, pago });
    }

    prevServiceSet = new Set(currentServices);
  }

  // Calculate additional services' prices
  let additionalTotalPrice = 0;
  const additionalItems: ServicioPagado[] = [];

  for (const entry of additionalEntries) {
    if (entry.services.length === 1) {
      const precio = Math.round(entry.pago.monto / 0.3);
      additionalTotalPrice += precio;
      additionalItems.push({
        servicio: entry.services[0],
        precio,
        sena: entry.pago.monto,
        mp_payment_id: entry.pago.mp_payment_id,
        esPagoActual: entry.pago.mp_payment_id === pagoActualMpId,
        esSenaAdicional: true,
      });
    } else {
      // Multiple services added at once - distribute using base prices
      const baseTotal = entry.services.reduce((sum, s) => sum + (PRECIOS_BASE_LERAYSI[s] || 5000), 0);
      const totalPrecio = Math.round(entry.pago.monto / 0.3);
      const scale = totalPrecio / baseTotal;

      for (const srv of entry.services) {
        const basePrice = PRECIOS_BASE_LERAYSI[srv] || 5000;
        const precio = Math.round(basePrice * scale);
        const sena = Math.round(precio * 0.3);
        additionalTotalPrice += precio;
        additionalItems.push({
          servicio: srv,
          precio,
          sena,
          mp_payment_id: entry.pago.mp_payment_id,
          esPagoActual: entry.pago.mp_payment_id === pagoActualMpId,
          esSenaAdicional: true,
        });
      }
    }
  }

  // Handle initial services (first payment)
  const firstPago = pagos[0];
  const initialServices = extractServicesFromDesc(firstPago.descripcion);
  const initialTotalPrice = precioTotal - additionalTotalPrice;

  if (initialServices.length === 1) {
    result.push({
      servicio: initialServices[0],
      precio: initialTotalPrice,
      sena: firstPago.monto,
      mp_payment_id: firstPago.mp_payment_id,
      esPagoActual: firstPago.mp_payment_id === pagoActualMpId,
      esSenaAdicional: false,
    });
  } else {
    // Multiple initial services - distribute proportionally using base prices
    const baseTotal = initialServices.reduce((sum, s) => sum + (PRECIOS_BASE_LERAYSI[s] || 5000), 0);
    const scale = initialTotalPrice / baseTotal;

    for (const srv of initialServices) {
      const basePrice = PRECIOS_BASE_LERAYSI[srv] || 5000;
      const precio = Math.round(basePrice * scale);
      const sena = Math.round(precio * 0.3);
      result.push({
        servicio: srv,
        precio,
        sena,
        mp_payment_id: firstPago.mp_payment_id,
        esPagoActual: firstPago.mp_payment_id === pagoActualMpId,
        esSenaAdicional: false,
      });
    }
  }

  // Append additional items after initial
  result.push(...additionalItems);

  return result;
}

const fmtARS = (n: number) => '$' + n.toLocaleString('es-AR');

/**
 * Template: Turno Confirmado (Estilos Leraysi)
 */
export const turnoConfirmadoTemplate = (data: TurnoConfirmadoData) => {
  // If detailed payment data available, use new 5-card design
  if (data.pagos && data.pagos.length > 0 && data.pago_actual_mp_id) {
    return turnoConfirmadoDetailedTemplate(data);
  }
  // Fallback to simple design (backward compatible)
  return turnoConfirmadoSimpleTemplate(data);
};

/**
 * Simple template (backward compatible, no payment breakdown)
 */
function turnoConfirmadoSimpleTemplate(data: TurnoConfirmadoData) {
  const content = `
    <!-- Success Banner -->
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="display: inline-block; background-color: #d1fae5; color: #065f46; padding: 12px 30px; border-radius: 50px; font-weight: 600; font-size: 18px;">
        ✅ ¡Tu turno está confirmado!
      </div>
    </div>

    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hola <strong>${data.clienta}</strong>,
    </p>
    <p style="margin: 0 0 25px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      ¡Gracias por tu pago! Tu turno ha sido confirmado exitosamente.
    </p>

    <!-- Card 1: Detalles del Turno -->
    <div style="background: linear-gradient(135deg, #875A7B 0%, #6B4F6B 100%); padding: 25px; margin: 25px 0; border-radius: 12px; color: #ffffff;">
      <h3 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; text-align: center;">📅 Detalles del Turno</h3>
      <table width="100%" style="border-collapse: collapse;">
        <tr>
          <td style="padding: 12px 0; font-size: 14px; opacity: 0.9; border-bottom: 1px solid rgba(255,255,255,0.2);">💇‍♀️ Servicio:</td>
          <td style="padding: 12px 0; font-size: 15px; font-weight: 600; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">${data.servicio_detalle || data.servicio}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; font-size: 14px; opacity: 0.9; border-bottom: 1px solid rgba(255,255,255,0.2);">📆 Fecha:</td>
          <td style="padding: 12px 0; font-size: 15px; font-weight: 600; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">${data.fecha}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; font-size: 14px; opacity: 0.9; border-bottom: 1px solid rgba(255,255,255,0.2);">⏰ Hora:</td>
          <td style="padding: 12px 0; font-size: 15px; font-weight: 600; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">${data.hora}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; font-size: 14px; opacity: 0.9;">📍 Dirección:</td>
          <td style="padding: 12px 0; font-size: 15px; font-weight: 600; text-align: right;">${data.direccion}</td>
        </tr>
      </table>
    </div>

    <!-- Payment Details (simple) -->
    <div style="background-color: #f0fdf4; border: 2px solid #22c55e; padding: 20px; margin: 25px 0; border-radius: 8px;">
      <h4 style="margin: 0 0 15px 0; color: #166534; font-size: 16px;">💳 Detalle del Pago</h4>
      <table width="100%" style="border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #4b5563; font-size: 14px;">Precio total:</td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">${fmtARS(data.precio)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #166534; font-size: 14px; font-weight: 600;">Seña pagada (30%):</td>
          <td style="padding: 8px 0; color: #166534; font-size: 16px; font-weight: 600; text-align: right;">${fmtARS(data.sena)}</td>
        </tr>
        <tr style="border-top: 1px dashed #d1d5db;">
          <td style="padding: 12px 0 8px 0; color: #4b5563; font-size: 14px;">Monto restante:</td>
          <td style="padding: 12px 0 8px 0; color: #1f2937; font-size: 14px; text-align: right;">${fmtARS(data.monto_restante)}</td>
        </tr>
      </table>
      <p style="margin: 15px 0 0 0; color: #6b7280; font-size: 12px;">
        ID de Pago: ${data.mp_payment_id}
      </p>
    </div>

    <!-- Important Info -->
    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <h4 style="margin: 0 0 10px 0; color: #92400e; font-size: 14px;">⚠️ Información Importante</h4>
      <ul style="margin: 0; padding-left: 20px; color: #78350f; font-size: 13px; line-height: 1.6;">
        <li>El monto restante (${fmtARS(data.monto_restante)}) debe abonarse el día del turno.</li>
        <li>En caso de necesitar cancelar, avisanos con al menos 24hs de anticipación.</li>
        <li>Te recomendamos llegar 5-10 minutos antes de tu turno.</li>
      </ul>
    </div>

    <p style="margin: 25px 0 0 0; color: #4b5563; font-size: 16px; line-height: 1.6; text-align: center;">
      ✨ ¡Te esperamos para dejarte divina! 💕
    </p>
  `;

  return leraysiEmailTemplate(content);
}

/**
 * Detailed template with per-service payment breakdown (5 cards)
 */
function turnoConfirmadoDetailedTemplate(data: TurnoConfirmadoData) {
  const serviciosPagados = buildServiciosPagados(
    data.pagos!,
    data.pago_actual_mp_id!,
    data.precio
  );

  const totalPagado = data.total_pagado_acumulado ?? data.sena;
  const montoRestante = data.precio - totalPagado;
  const hasAdditional = serviciosPagados.some(s => s.esSenaAdicional);

  // --- Build service rows HTML ---
  let servicioRowsHtml = '';
  let separatorInserted = false;

  for (const srv of serviciosPagados) {
    // Insert separator before first additional service
    if (srv.esSenaAdicional && !separatorInserted && hasAdditional) {
      servicioRowsHtml += `
        <tr>
          <td colspan="3" style="padding: 12px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-top: 1px dashed #9ca3af; width: 25%;"></td>
                <td style="text-align: center; color: #6b7280; font-size: 12px; font-weight: 600; white-space: nowrap; padding: 0 8px;">Servicio Agregado</td>
                <td style="border-top: 1px dashed #9ca3af; width: 25%;"></td>
              </tr>
            </table>
          </td>
        </tr>`;
      separatorInserted = true;
    }

    const highlightStyle = srv.esPagoActual
      ? 'background-color: #fef9c3; border-left: 3px solid #f59e0b;'
      : '';

    servicioRowsHtml += `
      <tr style="${highlightStyle}">
        <td style="padding: 10px 8px; color: #1f2937; font-size: 14px;">✅ ${srv.servicio}</td>
        <td style="padding: 10px 8px; color: #1f2937; font-size: 14px; text-align: right;">${fmtARS(srv.precio)}</td>
        <td style="padding: 10px 8px; color: #1f2937; font-size: 14px; text-align: right;">${fmtARS(srv.sena)}</td>
      </tr>`;
  }

  // --- Build comprobantes rows HTML ---
  let comprobantesRowsHtml = '';
  for (const srv of serviciosPagados) {
    comprobantesRowsHtml += `
      <tr>
        <td style="padding: 8px; color: #4b5563; font-size: 13px; border-bottom: 1px solid #e5e7eb;">${srv.servicio}</td>
        <td style="padding: 8px; color: #4b5563; font-size: 13px; text-align: right; border-bottom: 1px solid #e5e7eb; font-family: monospace;">${srv.mp_payment_id}</td>
      </tr>`;
  }

  const content = `
    <!-- Success Banner -->
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="display: inline-block; background-color: #d1fae5; color: #065f46; padding: 12px 30px; border-radius: 50px; font-weight: 600; font-size: 18px;">
        ✅ ¡Tu turno está confirmado!
      </div>
    </div>

    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hola <strong>${data.clienta}</strong>,
    </p>
    <p style="margin: 0 0 25px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      ¡Gracias por tu pago! Tu turno ha sido confirmado exitosamente. A continuación encontrarás los detalles de tu reserva.
    </p>

    <!-- Card 1: Detalles del Turno -->
    <div style="background: linear-gradient(135deg, #875A7B 0%, #6B4F6B 100%); padding: 25px; margin: 25px 0; border-radius: 12px; color: #ffffff;">
      <h3 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; text-align: center;">📅 Detalles del Turno</h3>
      <table width="100%" style="border-collapse: collapse;">
        <tr>
          <td style="padding: 12px 0; font-size: 14px; opacity: 0.9; border-bottom: 1px solid rgba(255,255,255,0.2);">👤 Nombre:</td>
          <td style="padding: 12px 0; font-size: 15px; font-weight: 600; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">${data.clienta}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; font-size: 14px; opacity: 0.9; border-bottom: 1px solid rgba(255,255,255,0.2);">📆 Fecha:</td>
          <td style="padding: 12px 0; font-size: 15px; font-weight: 600; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">${data.fecha}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; font-size: 14px; opacity: 0.9; border-bottom: 1px solid rgba(255,255,255,0.2);">⏰ Hora:</td>
          <td style="padding: 12px 0; font-size: 15px; font-weight: 600; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">${data.hora}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; font-size: 14px; opacity: 0.9;">📍 Dirección:</td>
          <td style="padding: 12px 0; font-size: 15px; font-weight: 600; text-align: right;">Yerbal 513, Caballito, Buenos Aires - Argentina</td>
        </tr>
      </table>
    </div>

    <!-- Card 2: Detalle de Servicios y Pagos -->
    <div style="background-color: #f0fdf4; border: 2px solid #22c55e; padding: 20px; margin: 25px 0; border-radius: 8px;">
      <h4 style="margin: 0 0 15px 0; color: #166534; font-size: 16px;">📋 Detalle de Servicios y Pagos</h4>
      <table width="100%" style="border-collapse: collapse;">
        <tr style="border-bottom: 2px solid #d1d5db;">
          <td style="padding: 8px 8px; color: #6b7280; font-size: 13px; font-weight: 600; width: 50%;">Servicio</td>
          <td style="padding: 8px 8px; color: #6b7280; font-size: 13px; font-weight: 600; text-align: right; width: 25%;">Precio</td>
          <td style="padding: 8px 8px; color: #6b7280; font-size: 13px; font-weight: 600; text-align: right; width: 25%;">Seña (30%)</td>
        </tr>
        ${servicioRowsHtml}
        <tr style="border-top: 2px solid #166534;">
          <td style="padding: 12px 8px 0 8px; color: #166534; font-size: 14px; font-weight: 700;">Total</td>
          <td style="padding: 12px 8px 0 8px; color: #166534; font-size: 14px; font-weight: 700; text-align: right;">${fmtARS(data.precio)}</td>
          <td style="padding: 12px 8px 0 8px; color: #166534; font-size: 14px; font-weight: 700; text-align: right;">${fmtARS(totalPagado)}</td>
        </tr>
      </table>
    </div>

    <!-- Card 3: Resumen de Cuenta -->
    <div style="background-color: #f8f9fa; border: 1px solid #e5e7eb; padding: 20px; margin: 25px 0; border-radius: 8px;">
      <h4 style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px;">💰 Resumen de Cuenta</h4>
      <table width="100%" style="border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #4b5563; font-size: 14px;">Total señas pagadas:</td>
          <td style="padding: 8px 0; color: #166534; font-size: 15px; font-weight: 600; text-align: right;">${fmtARS(totalPagado)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #4b5563; font-size: 14px;">Precio total servicios:</td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">${fmtARS(data.precio)}</td>
        </tr>
        <tr style="border-top: 1px solid #d1d5db;">
          <td style="padding: 12px 0 0 0; color: #92400e; font-size: 14px; font-weight: 600;">Monto restante (día del turno):</td>
          <td style="padding: 12px 0 0 0; color: #92400e; font-size: 16px; font-weight: 700; text-align: right;">${fmtARS(montoRestante)}</td>
        </tr>
      </table>
    </div>

    <!-- Card 4: Comprobantes de Pago -->
    <div style="background-color: #f8f9fa; border: 1px solid #e5e7eb; padding: 20px; margin: 25px 0; border-radius: 8px;">
      <h4 style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px;">🔍 Comprobantes de Pago</h4>
      <table width="100%" style="border-collapse: collapse;">
        <tr style="border-bottom: 2px solid #d1d5db;">
          <td style="padding: 8px; color: #6b7280; font-size: 13px; font-weight: 600;">Servicio</td>
          <td style="padding: 8px; color: #6b7280; font-size: 13px; font-weight: 600; text-align: right;">ID Pago</td>
        </tr>
        ${comprobantesRowsHtml}
      </table>
    </div>

    <!-- Card 5: Información Importante -->
    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <h4 style="margin: 0 0 10px 0; color: #92400e; font-size: 14px;">⚠️ Información Importante</h4>
      <ul style="margin: 0; padding-left: 20px; color: #78350f; font-size: 13px; line-height: 1.6;">
        <li>El monto restante (${fmtARS(montoRestante)}) debe abonarse el día del turno.</li>
        <li>En caso de necesitar cancelar, avisanos con al menos 24hs de anticipación.</li>
        <li>Te recomendamos llegar 5-10 minutos antes de tu turno.</li>
      </ul>
    </div>

    <p style="margin: 25px 0 0 0; color: #4b5563; font-size: 16px; line-height: 1.6; text-align: center;">
      ✨ ¡Te esperamos para dejarte divina! 💕
    </p>
  `;

  return leraysiEmailTemplate(content);
}

/**
 * Get Turno Confirmado template (exported for use in tool)
 */
export function getTurnoConfirmadoEmailTemplate(data: TurnoConfirmadoData): string {
  return turnoConfirmadoTemplate(data);
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
  },
  {
    type: 'turno_confirmado',
    name: 'Turno Confirmado (Leraysi)',
    description: 'Template de confirmación de turno para Estilos Leraysi con detalles de pago'
  }
];
