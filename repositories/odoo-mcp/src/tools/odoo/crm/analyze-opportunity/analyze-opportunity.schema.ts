import { z } from "zod";

/**
 * Schema Zod para validación de parámetros de odoo_analyze_opportunity
 */
export const analyzeOpportunitySchema = z.object({
  opportunityId: z.number()
    .int()
    .positive()
    .describe("ID de la oportunidad a analizar (obligatorio)")
});

export type AnalyzeOpportunityInput = z.infer<typeof analyzeOpportunitySchema>;

/**
 * Evento del chatter parseado
 */
export interface ChatterEvent {
  id: number;
  date: string;
  type: "client_message" | "email_sent" | "note" | "stage_change" | "activity" | "other";
  author: string;
  content: string;
  metadata?: {
    emailTo?: string;
    emailSubject?: string;
    oldValue?: any;
    newValue?: any;
    subtype?: string;
  };
}

/**
 * Análisis de la oportunidad
 */
export interface OpportunityAnalysis {
  opportunityId: number;
  opportunityName: string;
  customerName: string | null;
  currentStage: string;
  expectedRevenue: number;

  /** Timeline cronológico de eventos */
  timeline: ChatterEvent[];

  /** Resumen de interacciones */
  summary: {
    totalMessages: number;
    clientMessages: number;
    emailsSent: number;
    lastInteractionDate: string;
    daysSinceLastContact: number;
  };

  /** Análisis de necesidades detectadas */
  insights: {
    detectedNeeds: string[];
    clientSentiment: "positive" | "neutral" | "negative" | "unknown";
    nextSuggestedActions: string[];
  };
}

export type AnalyzeOpportunityResponse = OpportunityAnalysis;
