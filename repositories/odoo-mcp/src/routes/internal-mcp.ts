/**
 * Internal MCP Router
 *
 * Simplified MCP interface for internal services (n8n)
 * Uses service token auth instead of OAuth
 */

import { Router, Request, Response } from "express";
import { logger } from "@/lib/logger";
import { ToolRegistry } from "@/tools/base/ToolRegistry";
import { env } from "@/config/env";
import { createOdooClient, type OdooCredentials } from "@/lib/odoo";

const router = Router();

/**
 * Service Authentication Middleware
 */
function serviceAuth(req: Request, res: Response, next: Function) {
  const serviceToken = req.headers['x-service-token'];

  if (!serviceToken || serviceToken !== env.SERVICE_TOKEN) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Invalid or missing X-Service-Token"
    });
  }

  next();
}

// Apply service auth to all internal MCP routes
router.use(serviceAuth);

/**
 * GET /internal/mcp/tools
 *
 * List all available MCP tools
 */
router.get("/tools", async (req, res) => {
  try {
    const registry = ToolRegistry.getInstance();
    const tools = registry.listTools();

    // Format for consumption by LLM
    const toolsFormatted = tools.map(tool => ({
      name: tool.definition.name,
      description: tool.definition.description,
      inputSchema: tool.definition.inputSchema
    }));

    return res.json({
      tools: toolsFormatted,
      count: tools.length
    });
  } catch (error: any) {
    logger.error({ err: error }, "[InternalMCP] Error listing tools");
    return res.status(500).json({
      error: "list_tools_failed",
      message: error.message
    });
  }
});

/**
 * POST /internal/mcp/call-tool
 *
 * Execute a specific MCP tool
 *
 * Body:
 * {
 *   "tool": "odoo_schedule_meeting",
 *   "arguments": {
 *     "opportunityId": 123,
 *     "title": "Demo Odoo CRM",
 *     "startDatetime": "2025-11-05 15:00:00"
 *   }
 * }
 */
router.post("/call-tool", async (req, res) => {
  try {
    const { tool, arguments: toolArgs } = req.body;

    if (!tool || !toolArgs) {
      return res.status(400).json({
        error: "invalid_request",
        message: "Missing 'tool' or 'arguments' in request body"
      });
    }

    logger.info({ tool, arguments: toolArgs }, "[InternalMCP] Calling tool");

    const registry = ToolRegistry.getInstance();
    const toolInstance = registry.getTool(tool);

    if (!toolInstance) {
      return res.status(404).json({
        error: "tool_not_found",
        message: `Tool '${tool}' not found`
      });
    }

    // Create authenticated Odoo client for service account
    const credentials: OdooCredentials = {
      url: env.ODOO_SERVICE_URL,
      db: env.ODOO_SERVICE_DB,
      username: env.ODOO_SERVICE_USER,
      apiKey: env.ODOO_SERVICE_API_KEY
    };

    const odooClient = createOdooClient(credentials);
    await odooClient.authenticate();

    // Replace dummy client with authenticated service client
    // @ts-ignore - accessing private property for service account override
    toolInstance.tool.odooClient = odooClient;

    // Execute tool
    const result = await toolInstance.tool.execute(toolArgs);

    logger.info({ tool, result }, "[InternalMCP] Tool executed successfully");

    return res.json({
      success: true,
      tool,
      result
    });

  } catch (error: any) {
    logger.error({ err: error, tool: req.body.tool }, "[InternalMCP] Tool execution error");
    return res.status(500).json({
      error: "tool_execution_failed",
      message: error.message,
      details: error.stack
    });
  }
});

export { router as internalMcpRouter };
