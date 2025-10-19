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
import { SearchContactsTool } from "./odoo/contacts/search-contacts/search-contacts.tool";
import { CreateContactTool } from "./odoo/contacts/create-contact/create-contact.tool";
import { ScheduleMeetingTool } from "./odoo/calendar/schedule-meeting/schedule-meeting.tool";
import { SendEmailTool } from "./odoo/email/send-email/send-email.tool";
import { getOdooClient } from "@/lib/odoo";
import { logger } from "@/lib/logger";

export async function initializeTools(): Promise<ToolRegistry> {
  const registry = ToolRegistry.getInstance();
  logger.info("[ToolRegistry] Initializing tools...");

  const odooClient = getOdooClient();

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

  const stats = registry.getStats();
  logger.info({ totalTools: stats.totalTools, categories: stats.toolsByCategory }, "[ToolRegistry] Tools initialized");

  return registry;
}
