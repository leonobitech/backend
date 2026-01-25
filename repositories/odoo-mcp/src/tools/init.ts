/**
 * Tool Registry Initialization
 *
 * Registers all available tools with the ToolRegistry.
 * This is where we wire up both modular tools and legacy tools.
 */

import { ToolRegistry } from "./base/ToolRegistry";
import { GetLeadsTool } from "./odoo/crm/get-leads/get-leads.tool";
import { CreateLeadTool } from "./odoo/crm/create-lead/create-lead.tool";
import { GetOpportunitiesTool } from "./odoo/crm/get-opportunities/get-opportunities.tool";
import { UpdateDealStageTool } from "./odoo/crm/update-deal-stage/update-deal-stage.tool";
import { AnalyzeOpportunityTool } from "./odoo/crm/analyze-opportunity/analyze-opportunity.tool";
import { SearchContactsTool } from "./odoo/contacts/search-contacts/search-contacts.tool";
import { CreateContactTool } from "./odoo/contacts/create-contact/create-contact.tool";
import { ScheduleMeetingTool } from "./odoo/calendar/schedule-meeting/schedule-meeting.tool";
import { SendEmailTool } from "./odoo/email/send-email/send-email.tool";
import { CompleteActivityTool } from "./odoo/activities/complete-activity/complete-activity.tool";
import { SendReminderTool } from "./odoo/activities/send-reminder/send-reminder.tool";
// Leraysi Salon Tools
import { CrearTurnoLeraysiTool } from "./odoo/leraysi/crear-turno/crear-turno.tool";
import { ConsultarTurnosDiaTool } from "./odoo/leraysi/consultar-turnos-dia/consultar-turnos-dia.tool";
import { ConsultarDisponibilidadTool } from "./odoo/leraysi/consultar-disponibilidad/consultar-disponibilidad.tool";
import { ConfirmarTurnoTool } from "./odoo/leraysi/confirmar-turno/confirmar-turno.tool";
import { CancelarTurnoTool } from "./odoo/leraysi/cancelar-turno/cancelar-turno.tool";
import { ReprogramarTurnoTool } from "./odoo/leraysi/reprogramar-turno/reprogramar-turno.tool";
import { ConfirmarPagoCompletoTool } from "./odoo/leraysi/confirmar-pago-completo/confirmar-pago-completo.tool";
import { createOdooClient, type OdooCredentials } from "@/lib/odoo";
import { logger } from "@/lib/logger";

/**
 * TEMPORARY SOLUTION: Use dummy credentials for tool initialization
 *
 * TODO: Refactor tool architecture to inject credentials per-request instead of at init
 *
 * Current flow:
 * 1. Tools are initialized once at startup with dummy client
 * 2. When a tool is called, we need to:
 *    - Get userId from OAuth token
 *    - Load user's Odoo credentials from DB
 *    - Create new OdooClient with user's credentials
 *    - Execute the tool with user-specific client
 */
const DUMMY_CREDENTIALS: OdooCredentials = {
  url: "https://odoo.example.com",
  db: "dummy",
  username: "dummy@example.com",
  apiKey: "dummy_key"
};

export async function initializeTools(): Promise<ToolRegistry> {
  const registry = ToolRegistry.getInstance();
  logger.info("[ToolRegistry] Initializing tools...");

  // IMPORTANT: This is a dummy client just for initialization
  // Each tool execution should create a new client with user-specific credentials
  const odooClient = createOdooClient(DUMMY_CREDENTIALS);

  // CRM Tools
  registry.register(new GetLeadsTool(odooClient), {
    category: "odoo/crm",
    version: "2.0.0",
    requiredScopes: ["odoo:read"],
    estimatedTime: 1000,
  });

  registry.register(new CreateLeadTool(odooClient), {
    category: "odoo/crm",
    version: "2.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 1500,
  });

  registry.register(new GetOpportunitiesTool(odooClient), {
    category: "odoo/crm",
    version: "2.0.0",
    requiredScopes: ["odoo:read"],
    estimatedTime: 1200,
  });

  registry.register(new UpdateDealStageTool(odooClient), {
    category: "odoo/crm",
    version: "2.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 800,
  });

  registry.register(new AnalyzeOpportunityTool(odooClient), {
    category: "odoo/crm",
    version: "2.0.0",
    requiredScopes: ["odoo:read"],
    estimatedTime: 3000,
  });

  // Contacts Tools
  registry.register(new SearchContactsTool(odooClient), {
    category: "odoo/contacts",
    version: "2.0.0",
    requiredScopes: ["odoo:read"],
    estimatedTime: 900,
  });

  registry.register(new CreateContactTool(odooClient), {
    category: "odoo/contacts",
    version: "2.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 1200,
  });

  // Calendar Tools
  registry.register(new ScheduleMeetingTool(odooClient), {
    category: "odoo/calendar",
    version: "2.0.0",
    requiredScopes: ["odoo:calendar"],
    estimatedTime: 2000,
  });

  // Email Tools
  registry.register(new SendEmailTool(odooClient), {
    category: "odoo/email",
    version: "2.0.0",
    requiredScopes: ["odoo:email"],
    estimatedTime: 1500,
  });

  // Activity Management Tools
  registry.register(new CompleteActivityTool(odooClient), {
    category: "odoo/activities",
    version: "2.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 1000,
  });

  registry.register(new SendReminderTool(odooClient), {
    category: "odoo/activities",
    version: "2.0.0",
    requiredScopes: ["odoo:email"],
    estimatedTime: 1500,
  });

  // Leraysi Salon Tools (Estilos Leraysi - Beauty Salon)
  registry.register(new CrearTurnoLeraysiTool(odooClient), {
    category: "odoo/leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 2000,
  });

  registry.register(new ConsultarTurnosDiaTool(odooClient), {
    category: "odoo/leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:read"],
    estimatedTime: 1000,
  });

  registry.register(new ConsultarDisponibilidadTool(odooClient), {
    category: "odoo/leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:read"],
    estimatedTime: 1000,
  });

  registry.register(new ConfirmarTurnoTool(odooClient), {
    category: "odoo/leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 800,
  });

  registry.register(new CancelarTurnoTool(odooClient), {
    category: "odoo/leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 800,
  });

  registry.register(new ReprogramarTurnoTool(odooClient), {
    category: "odoo/leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:write", "odoo:calendar"],
    estimatedTime: 1500,
  });

  registry.register(new ConfirmarPagoCompletoTool(odooClient), {
    category: "odoo/leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:write", "odoo:calendar", "odoo:email"],
    estimatedTime: 5000,
  });

  const stats = registry.getStats();
  logger.info({ totalTools: stats.totalTools, categories: stats.toolsByCategory }, "[ToolRegistry] Tools initialized");

  return registry;
}
