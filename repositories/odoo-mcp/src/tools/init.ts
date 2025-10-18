/**
 * Tool Registry Initialization
 *
 * Registers all available tools with the ToolRegistry.
 * This is where we wire up both modular tools and legacy tools.
 */

import { ToolRegistry } from "./base/ToolRegistry";
import { GetLeadsTool } from "./odoo/crm/get-leads/get-leads.tool";
import { CreateLeadTool } from "./odoo/crm/create-lead/create-lead.tool";
import { getOdooClient } from "@/lib/odoo";
import { logger } from "@/lib/logger";

/**
 * Initialize and register all tools
 * @returns Configured ToolRegistry instance
 */
export async function initializeTools(): Promise<ToolRegistry> {
  const registry = ToolRegistry.getInstance();

  logger.info("[ToolRegistry] Initializing tools...");

  // Get Odoo client for tools that need it
  const odooClient = getOdooClient();

  // === MODULAR TOOLS ===

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

  // TODO: Register remaining modular tools here:
  // - get-opportunities
  // - update-deal-stage
  // - search-contacts
  // - create-contact
  // - schedule-meeting
  // - send-email

  const stats = registry.getStats();
  logger.info(
    {
      totalTools: stats.totalTools,
      categories: stats.toolsByCategory,
    },
    "[ToolRegistry] Tools initialized"
  );

  return registry;
}
