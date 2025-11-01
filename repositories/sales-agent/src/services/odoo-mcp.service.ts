/**
 * Odoo MCP Service
 *
 * Integra el Sales Agent (n8n) con Odoo MCP Server para operaciones de CRM:
 * - Crear leads en Odoo desde WhatsApp conversations
 * - Agendar reuniones/demos con leads calificados
 * - Enviar propuestas comerciales profesionales
 * - Mover leads a través del funnel de Odoo
 * - Marcar oportunidades como ganadas/perdidas
 *
 * Este servicio actúa como bridge entre n8n (Master Agent Node #50) y Odoo MCP Server.
 */

import axios, { AxiosInstance } from 'axios';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface OdooMCPConfig {
  baseURL: string;
  apiKey?: string; // Si el MCP server requiere auth
  timeout?: number;
}

export interface CreateLeadInput {
  name: string;
  partnerName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  description?: string;
  expectedRevenue?: number;
  type?: 'lead' | 'opportunity';
}

export interface CreateLeadResponse {
  leadId: number;
  partnerId?: number;
  message: string;
}

export interface ScheduleMeetingInput {
  opportunityId: number;
  title: string;
  startDatetime: string; // ISO format: "YYYY-MM-DD HH:MM:SS"
  durationHours?: number;
  description?: string;
  location?: string;
  forceSchedule?: boolean;
}

export interface ScheduleMeetingResponse {
  eventId?: number;
  message: string;
  conflict?: {
    conflicts: string[];
    availableSlots: string[];
  };
}

export interface SendEmailInput {
  opportunityId: number;
  subject: string;
  body?: string;
  emailTo?: string;
  templateType?: 'proposal' | 'demo' | 'followup' | 'welcome' | 'custom';
  templateData?: {
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
  };
}

export interface SendEmailResponse {
  mailId: number;
  message: string;
  recipient: string;
  queueProcessed: boolean;
  templateUsed?: string;
}

export interface UpdateDealStageInput {
  opportunityId: number;
  stageName: 'New' | 'Qualified' | 'Proposition' | 'Won' | 'Lost';
}

export interface UpdateDealStageResponse {
  success: boolean;
  opportunityId: number;
  newStage: string;
}

export interface GetOpportunitiesInput {
  limit?: number;
  stage?: string;
  minAmount?: number;
}

export interface Opportunity {
  id: number;
  name: string;
  partner: string;
  expectedRevenue: number;
  probability: number;
  stage: string;
  assignedTo: string;
  deadline?: string;
}

export interface GetOpportunitiesResponse {
  total: number;
  totalRevenue: number;
  opportunities: Opportunity[];
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class OdooMCPService {
  private client: AxiosInstance;

  constructor(config: OdooMCPConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` })
      }
    });
  }

  /**
   * Crea un lead en Odoo CRM desde una conversación de WhatsApp
   *
   * @usage Master Agent (Node #50) llama esto cuando:
   * - Lead calificado (stage: qualify o proposal_ready)
   * - Email capturado
   * - Business context claro
   * - Intent: "request_proposal" o "schedule_demo"
   */
  async odoo_create_lead(input: CreateLeadInput): Promise<CreateLeadResponse> {
    const response = await this.client.post('/tools/odoo_create_lead', input);
    return response.data;
  }

  /**
   * Agenda una reunión/demo con un lead calificado
   *
   * @usage Master Agent llama esto cuando:
   * - Lead solicita agendar demo
   * - Ya existe opportunity en Odoo (creada previamente)
   * - Fecha/hora propuesta por lead o sugerida por agente
   *
   * @side-effects
   * - Mueve opportunity de "Qualified" → "Proposition" automáticamente
   * - Crea evento en calendario de Odoo
   * - Envía notificaciones a participantes (lead + vendedor)
   * - Registra actividad en Chatter de Odoo
   */
  async odoo_schedule_meeting(input: ScheduleMeetingInput): Promise<ScheduleMeetingResponse> {
    const response = await this.client.post('/tools/odoo_schedule_meeting', input);
    return response.data;
  }

  /**
   * Envía propuesta comercial profesional por email
   *
   * @usage Master Agent llama esto cuando:
   * - Lead solicita propuesta formal
   * - stage >= "qualify"
   * - Email capturado
   * - Servicios de interés identificados
   *
   * @templates Disponibles:
   * - 'proposal': Propuesta comercial formal con pricing
   * - 'demo': Confirmación de demo agendado
   * - 'followup': Seguimiento post-interacción
   * - 'welcome': Primer contacto formal
   * - 'custom': Body personalizado (no template)
   *
   * @side-effects
   * - Mueve opportunity de "Qualified" → "Proposition" (si template=proposal o demo)
   * - Email enviado vía Odoo mail queue
   * - Registrado en Chatter con tracking
   */
  async odoo_send_email(input: SendEmailInput): Promise<SendEmailResponse> {
    const response = await this.client.post('/tools/odoo_send_email', input);
    return response.data;
  }

  /**
   * Mueve una opportunity a través del pipeline de Odoo
   *
   * @usage Master Agent llama esto para:
   * - Marcar como ganado (Won): cuando lead confirma compra
   * - Marcar como perdido (Lost): cuando lead rechaza o no responde
   * - Avanzar manualmente entre etapas
   *
   * @stages Pipeline típico:
   * - New: Lead recién creado
   * - Qualified: Lead calificado (email + interés claro)
   * - Proposition: Propuesta enviada o demo agendado
   * - Won: Deal cerrado
   * - Lost: Oportunidad perdida
   */
  async odoo_update_deal_stage(input: UpdateDealStageInput): Promise<UpdateDealStageResponse> {
    const response = await this.client.post('/tools/odoo_update_deal_stage', input);
    return response.data;
  }

  /**
   * Obtiene oportunidades del pipeline para análisis
   *
   * @usage Master Agent puede consultar esto para:
   * - Verificar si lead ya existe antes de crear duplicado
   * - Obtener ID de opportunity existente
   * - Reportar estado del pipeline al usuario admin
   */
  async odoo_get_opportunities(input: GetOpportunitiesInput = {}): Promise<GetOpportunitiesResponse> {
    const response = await this.client.post('/tools/odoo_get_opportunities', input);
    return response.data;
  }
}

// ============================================================================
// SINGLETON INSTANCE (para uso en n8n)
// ============================================================================

/**
 * Instancia singleton del servicio Odoo MCP
 * Configurada con variables de entorno
 */
let odooMCPInstance: OdooMCPService | null = null;

export function getOdooMCPService(): OdooMCPService {
  if (!odooMCPInstance) {
    const baseURL = process.env.ODOO_MCP_URL || 'http://localhost:8100';
    const apiKey = process.env.ODOO_MCP_API_KEY;

    odooMCPInstance = new OdooMCPService({
      baseURL,
      apiKey,
      timeout: 30000
    });
  }

  return odooMCPInstance;
}

// ============================================================================
// HELPER FUNCTIONS (para uso directo en n8n Code nodes)
// ============================================================================

/**
 * Helper: Crea lead en Odoo desde datos de Baserow lead
 *
 * @example Uso en n8n Code node:
 * ```javascript
 * const { createLeadFromBaserow } = require('./odoo-mcp.service');
 * const lead = $json; // { full_name, phone_number, email, business_name, interests, ... }
 * const result = await createLeadFromBaserow(lead);
 * return [{ json: result }];
 * ```
 */
export async function createLeadFromBaserow(baserowLead: any): Promise<CreateLeadResponse> {
  const service = getOdooMCPService();

  // Construir nombre descriptivo del lead
  const interests = Array.isArray(baserowLead.interests)
    ? baserowLead.interests.join(', ')
    : baserowLead.interests || 'General';

  const leadName = baserowLead.business_name
    ? `${baserowLead.business_name} - ${interests}`
    : `${baserowLead.full_name} - ${interests}`;

  const description = `
Lead capturado desde WhatsApp Sales Agent
- Conversation ID: ${baserowLead.conversation_id || 'N/A'}
- Stage en Sales Agent: ${baserowLead.stage || 'explore'}
- Services seen: ${baserowLead.services_seen || 0}
- Prices asked: ${baserowLead.prices_asked || 0}
- Deep interest: ${baserowLead.deep_interest || 0}
- Channel: ${baserowLead.channel || 'whatsapp'}
- Country: ${baserowLead.country || 'Unknown'}
  `.trim();

  return service.odoo_create_lead({
    name: leadName,
    partnerName: baserowLead.business_name,
    contactName: baserowLead.full_name,
    email: baserowLead.email,
    phone: baserowLead.phone_number,
    description,
    type: baserowLead.stage === 'proposal_ready' ? 'opportunity' : 'lead'
  });
}

/**
 * Helper: Envía propuesta comercial con servicios personalizados
 *
 * @example Uso en Master Agent (Node #50):
 * ```javascript
 * const { sendProposalEmail } = require('./odoo-mcp.service');
 * const result = await sendProposalEmail({
 *   opportunityId: 42,
 *   customerName: 'Juan Pérez',
 *   companyName: 'Restaurante El Buen Sabor',
 *   services: ['WhatsApp Chatbot', 'Smart Reservations'],
 *   totalPrice: '$158/mes'
 * });
 * ```
 */
export async function sendProposalEmail(params: {
  opportunityId: number;
  customerName: string;
  companyName: string;
  services: string[];
  totalPrice: string;
}): Promise<SendEmailResponse> {
  const service = getOdooMCPService();

  const customContent = `
    <h3>Servicios Propuestos:</h3>
    <ul>
      ${params.services.map(s => `<li>${s}</li>`).join('\n')}
    </ul>
    <p><strong>Inversión total:</strong> ${params.totalPrice}</p>
  `;

  return service.odoo_send_email({
    opportunityId: params.opportunityId,
    subject: `Propuesta Comercial - ${params.companyName}`,
    templateType: 'proposal',
    templateData: {
      customerName: params.customerName,
      companyName: params.companyName,
      price: params.totalPrice,
      customContent
    }
  });
}

/**
 * Helper: Agenda demo con disponibilidad automática
 *
 * @example Uso en Master Agent (Node #50):
 * ```javascript
 * const { scheduleDemoMeeting } = require('./odoo-mcp.service');
 * const result = await scheduleDemoMeeting({
 *   opportunityId: 42,
 *   customerName: 'Juan Pérez',
 *   requestedDate: '2025-11-05',
 *   requestedTime: '10:00',
 *   serviceName: 'WhatsApp Chatbot'
 * });
 *
 * if (result.conflict) {
 *   // Informar al lead sobre slots disponibles
 *   const slots = result.conflict.availableSlots.join(', ');
 *   return { text: `Tengo conflicto en ese horario. Disponible: ${slots}` };
 * }
 * ```
 */
export async function scheduleDemoMeeting(params: {
  opportunityId: number;
  customerName: string;
  requestedDate: string; // "YYYY-MM-DD"
  requestedTime: string; // "HH:MM"
  serviceName: string;
}): Promise<ScheduleMeetingResponse> {
  const service = getOdooMCPService();

  const startDatetime = `${params.requestedDate} ${params.requestedTime}:00`;
  const title = `Demo: ${params.serviceName} - ${params.customerName}`;
  const description = `
Demo personalizado de ${params.serviceName} para ${params.customerName}.

Agenda:
1. Presentación del servicio y características principales
2. Demo en vivo adaptado a su industria
3. Sesión de preguntas y respuestas
4. Próximos pasos y propuesta comercial
  `.trim();

  return service.odoo_schedule_meeting({
    opportunityId: params.opportunityId,
    title,
    startDatetime,
    durationHours: 1,
    description,
    location: 'Google Meet (link enviado por email)',
    forceSchedule: false // Detectar conflictos
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  OdooMCPService,
  getOdooMCPService,
  createLeadFromBaserow,
  sendProposalEmail,
  scheduleDemoMeeting
};
