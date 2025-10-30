/**
 * Tool: odoo_analyze_opportunity
 *
 * Analiza el contexto completo de una oportunidad incluyendo todo el historial
 * del chatter para entender necesidades del cliente y sugerir próximos pasos.
 *
 * @module tools/odoo/crm/analyze-opportunity
 */

import {
  analyzeOpportunitySchema,
  type AnalyzeOpportunityInput,
  type AnalyzeOpportunityResponse,
  type ChatterEvent
} from "./analyze-opportunity.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

/**
 * Handler para la tool odoo_analyze_opportunity
 */
export class AnalyzeOpportunityTool implements ITool<AnalyzeOpportunityInput, AnalyzeOpportunityResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  /**
   * Ejecuta la tool con los parámetros validados
   */
  async execute(input: unknown): Promise<AnalyzeOpportunityResponse> {
    // 1. Validar input
    const params = analyzeOpportunitySchema.parse(input);

    // 2. Obtener datos de la oportunidad
    const opportunity = await this.getOpportunityData(params.opportunityId);

    // 3. Obtener historial completo del chatter
    const chatterMessages = await this.getChatterHistory(params.opportunityId);

    // 4. Parsear y clasificar eventos
    const timeline = this.parseChatterEvents(chatterMessages);

    // 5. Generar análisis y métricas
    const analysis = this.analyzeOpportunity(opportunity, timeline);

    return analysis;
  }

  /**
   * Obtiene los datos básicos de la oportunidad
   */
  private async getOpportunityData(opportunityId: number) {
    const opportunities = await this.odooClient.search("crm.lead", [["id", "=", opportunityId]], {
      fields: [
        "id",
        "name",
        "partner_name",
        "partner_id",
        "expected_revenue",
        "probability",
        "stage_id",
        "user_id",
        "team_id",
        "date_deadline",
        "date_closed",
        "create_date",
        "type"
      ],
      limit: 1
    });

    if (opportunities.length === 0) {
      throw new Error(`Opportunity with ID ${opportunityId} not found`);
    }

    return opportunities[0];
  }

  /**
   * Obtiene el historial completo del chatter
   */
  private async getChatterHistory(opportunityId: number) {
    // Buscar todos los mensajes relacionados con esta oportunidad
    const messages = await this.odooClient.search(
      "mail.message",
      [
        ["model", "=", "crm.lead"],
        ["res_id", "=", opportunityId]
      ],
      {
        fields: [
          "id",
          "date",
          "body",
          "preview",
          "message_type",
          "subtype_id",
          "author_id",
          "email_from",
          "subject",
          "tracking_value_ids",
          "mail_activity_type_id",
          "is_internal"
        ],
        order: "date asc",
        limit: 200
      }
    );

    return messages;
  }

  /**
   * Parsea y clasifica los eventos del chatter
   */
  private parseChatterEvents(messages: any[]): ChatterEvent[] {
    return messages.map((msg) => {
      const event: ChatterEvent = {
        id: msg.id,
        date: msg.date,
        type: this.classifyMessageType(msg),
        author: this.getAuthorName(msg),
        content: this.extractContent(msg),
        metadata: this.extractMetadata(msg)
      };

      return event;
    });
  }

  /**
   * Clasifica el tipo de mensaje
   */
  private classifyMessageType(msg: any): ChatterEvent["type"] {
    // Email enviado (notificación del sistema)
    if (msg.body && msg.body.includes("📧 Email enviado")) {
      return "email_sent";
    }

    // Mensaje del cliente
    if (msg.body && msg.body.includes("<strong>Cliente:")) {
      return "client_message";
    }

    // Cambio de etapa (tracking_value_ids contiene datos)
    if (msg.tracking_value_ids && msg.tracking_value_ids.length > 0) {
      return "stage_change";
    }

    // Nota interna
    if (msg.is_internal) {
      return "note";
    }

    // Actividad
    if (msg.mail_activity_type_id) {
      return "activity";
    }

    return "other";
  }

  /**
   * Extrae el nombre del autor
   */
  private getAuthorName(msg: any): string {
    if (msg.author_id && Array.isArray(msg.author_id) && msg.author_id.length > 1) {
      return msg.author_id[1]; // [id, name]
    }
    if (msg.email_from) {
      return msg.email_from;
    }
    return "Sistema";
  }

  /**
   * Extrae el contenido limpio del mensaje
   */
  private extractContent(msg: any): string {
    if (!msg.body) {
      return msg.preview || "";
    }

    // Limpiar HTML básico
    let content = msg.body;

    // Extraer contenido del cliente
    const clientMatch = content.match(/<strong>Cliente:\s*<\/strong>(.*?)(?:<\/p>|$)/s);
    if (clientMatch) {
      return clientMatch[1].trim();
    }

    // Extraer contenido de bot
    const botMatch = content.match(/<strong>🤖.*?<\/strong><\/p><p>(.*?)(?:<\/p>|$)/s);
    if (botMatch) {
      return botMatch[1].trim();
    }

    // Usar preview si está disponible
    if (msg.preview) {
      return msg.preview;
    }

    // Limpiar tags HTML básicos
    return content
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 500);
  }

  /**
   * Extrae metadata adicional
   */
  private extractMetadata(msg: any): ChatterEvent["metadata"] | undefined {
    const metadata: ChatterEvent["metadata"] = {};

    // Extraer info de email
    if (msg.body && msg.body.includes("📧 Email enviado")) {
      const toMatch = msg.body.match(/<strong>Para:<\/strong><\/td>\s*<td[^>]*>(.*?)<\/td>/);
      const subjectMatch = msg.body.match(/<strong>Asunto:<\/strong><\/td>\s*<td[^>]*>(.*?)<\/td>/);

      if (toMatch) metadata.emailTo = toMatch[1].trim();
      if (subjectMatch) metadata.emailSubject = subjectMatch[1].trim();
    }

    // Subtype
    if (msg.subtype_id && Array.isArray(msg.subtype_id) && msg.subtype_id.length > 1) {
      metadata.subtype = msg.subtype_id[1];
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  /**
   * Genera el análisis completo de la oportunidad
   */
  private analyzeOpportunity(opportunity: any, timeline: ChatterEvent[]): AnalyzeOpportunityResponse {
    // Calcular métricas
    const clientMessages = timeline.filter((e) => e.type === "client_message");
    const emailsSent = timeline.filter((e) => e.type === "email_sent");

    const lastInteraction = timeline.length > 0 ? timeline[timeline.length - 1].date : opportunity.create_date;
    const daysSinceLastContact = this.calculateDaysSince(lastInteraction);

    // Detectar necesidades del cliente
    const detectedNeeds = this.detectNeeds(timeline);

    // Analizar sentimiento
    const clientSentiment = this.analyzeSentiment(clientMessages);

    // Sugerir próximos pasos
    const nextSuggestedActions = this.suggestNextActions(opportunity, timeline, daysSinceLastContact);

    return {
      opportunityId: opportunity.id,
      opportunityName: opportunity.name,
      customerName: opportunity.partner_name || (opportunity.partner_id ? opportunity.partner_id[1] : null),
      currentStage: opportunity.stage_id ? opportunity.stage_id[1] : "Unknown",
      expectedRevenue: opportunity.expected_revenue || 0,

      timeline,

      summary: {
        totalMessages: timeline.length,
        clientMessages: clientMessages.length,
        emailsSent: emailsSent.length,
        lastInteractionDate: lastInteraction,
        daysSinceLastContact
      },

      insights: {
        detectedNeeds,
        clientSentiment,
        nextSuggestedActions
      }
    };
  }

  /**
   * Detecta necesidades del cliente basado en mensajes
   */
  private detectNeeds(timeline: ChatterEvent[]): string[] {
    const needs: string[] = [];
    const keywords = {
      demo: ["demo", "demostración", "presentación"],
      meeting: ["reunión", "meeting", "junta"],
      proposal: ["propuesta", "cotización", "presupuesto"],
      automation: ["automatización", "automation", "proceso"],
      crm: ["crm", "ventas", "clientes"],
      erp: ["erp", "odoo", "sistema"]
    };

    const allContent = timeline
      .filter((e) => e.type === "client_message")
      .map((e) => e.content.toLowerCase())
      .join(" ");

    for (const [need, words] of Object.entries(keywords)) {
      if (words.some((word) => allContent.includes(word))) {
        needs.push(need);
      }
    }

    return needs;
  }

  /**
   * Analiza el sentimiento del cliente
   */
  private analyzeSentiment(clientMessages: ChatterEvent[]): "positive" | "neutral" | "negative" | "unknown" {
    if (clientMessages.length === 0) return "unknown";

    const lastMessages = clientMessages.slice(-3);
    const content = lastMessages.map((m) => m.content.toLowerCase()).join(" ");

    const positiveWords = ["gracias", "excelente", "perfecto", "bien", "ok", "listo"];
    const negativeWords = ["no", "problema", "mal", "duda", "preocup"];

    const positiveCount = positiveWords.filter((word) => content.includes(word)).length;
    const negativeCount = negativeWords.filter((word) => content.includes(word)).length;

    if (positiveCount > negativeCount) return "positive";
    if (negativeCount > positiveCount) return "negative";
    return "neutral";
  }

  /**
   * Sugiere próximos pasos
   */
  private suggestNextActions(opportunity: any, timeline: ChatterEvent[], daysSinceContact: number): string[] {
    const actions: string[] = [];

    // Sin contacto reciente
    if (daysSinceContact > 7) {
      actions.push("Hacer follow-up - han pasado más de 7 días sin contacto");
    }

    // Demo agendada pero no realizada
    const hasDemoScheduled = timeline.some((e) => e.content.toLowerCase().includes("demo") && e.type === "email_sent");
    if (hasDemoScheduled && daysSinceContact < 2) {
      actions.push("Preparar demo y confirmar asistencia");
    }

    // Cliente respondió positivamente
    const lastClientMsg = timeline.filter((e) => e.type === "client_message").pop();
    if (lastClientMsg && lastClientMsg.content.toLowerCase().includes("gracias")) {
      actions.push("Enviar propuesta comercial o siguiente paso en el proceso");
    }

    // Sin actividad reciente
    if (timeline.filter((e) => e.type === "email_sent").length === 0) {
      actions.push("Iniciar contacto formal con email de presentación");
    }

    // Fallback
    if (actions.length === 0) {
      actions.push("Revisar contexto y definir estrategia de seguimiento");
    }

    return actions;
  }

  /**
   * Calcula días desde una fecha
   */
  private calculateDaysSince(dateString: string): number {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Definición de la tool para el registro MCP
   */
  definition(): ToolDefinition {
    return {
      name: "odoo_analyze_opportunity",
      description:
        "Analiza el contexto completo de una oportunidad en Odoo CRM, incluyendo todo el historial del chatter (mensajes, emails, cambios de etapa). Detecta necesidades del cliente, sentimiento, y sugiere próximos pasos estratégicos.",
      inputSchema: {
        type: "object",
        properties: {
          opportunityId: {
            type: "number",
            description: "ID de la oportunidad a analizar (obligatorio)"
          }
        },
        required: ["opportunityId"]
      }
    };
  }
}
