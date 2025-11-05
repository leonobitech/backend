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
  const serviceToken = req.header("X-Service-Token");

  // Check if SERVICE_TOKEN is configured
  if (!env.SERVICE_TOKEN) {
    logger.error("[InternalMCP] SERVICE_TOKEN not configured in .env");
    return res.status(500).json({
      error: "server_misconfigured",
      message: "Service token authentication not configured"
    });
  }

  // Validate token
  if (!serviceToken) {
    logger.warn({ headers: req.headers }, "[InternalMCP] Missing X-Service-Token header");
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing X-Service-Token header"
    });
  }

  if (serviceToken !== env.SERVICE_TOKEN) {
    logger.warn("[InternalMCP] Invalid service token");
    return res.status(401).json({
      error: "unauthorized",
      message: "Invalid X-Service-Token"
    });
  }

  logger.debug("[InternalMCP] Service token authenticated successfully");
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
    const tools = registry.listAll();

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
    let { tool, arguments: toolArgs } = req.body;

    // Handle n8n format: [{ "JSON": { ... } }]
    // When n8n uses "Defined automatically by the model", it wraps arguments in this format
    if (!tool && Array.isArray(req.body) && req.body.length > 0 && req.body[0].JSON) {
      logger.info({ body: req.body }, "[InternalMCP] Detected n8n format, extracting tool arguments");

      // Extract arguments from n8n wrapper
      toolArgs = req.body[0].JSON;

      // Infer tool name from arguments structure
      // For now, we'll require tool name to be passed separately or default to a specific tool
      // This is a limitation of n8n's format - it doesn't include tool name in the payload
      if (toolArgs.opportunityId !== undefined) {
        // Likely an Odoo tool - check if it has email/meeting specific fields
        if (toolArgs.emailTo || toolArgs.subject) {
          tool = "odoo_send_email";
        } else if (toolArgs.startDatetime || toolArgs.title) {
          tool = "odoo_schedule_meeting";
        } else if (toolArgs.stageName) {
          tool = "odoo_update_deal_stage";
        }
      }

      logger.info({ inferredTool: tool }, "[InternalMCP] Inferred tool from n8n arguments");
    }

    if (!tool || !toolArgs) {
      return res.status(400).json({
        error: "invalid_request",
        message: "Missing 'tool' or 'arguments' in request body"
      });
    }

    logger.info({ tool, arguments: toolArgs }, "[InternalMCP] Calling tool");

    const registry = ToolRegistry.getInstance();
    const toolInstance = registry.get(tool);

    if (!toolInstance) {
      return res.status(404).json({
        error: "tool_not_found",
        message: `Tool '${tool}' not found`
      });
    }

    // Create authenticated Odoo client for service account
    const credentials: OdooCredentials = {
      url: env.ODOO_SERVICE_URL!,
      db: env.ODOO_SERVICE_DB!,
      username: env.ODOO_SERVICE_USER!,
      apiKey: env.ODOO_SERVICE_API_KEY!
    };

    const odooClient = createOdooClient(credentials);
    await odooClient.authenticate();

    // Replace dummy client with authenticated service client
    // @ts-ignore - accessing private property for service account override
    toolInstance.odooClient = odooClient;

    // Execute tool
    const result = await toolInstance.execute(toolArgs);

    logger.info({ tool, result }, "[InternalMCP] Tool executed successfully");

    return res.json({
      success: true,
      tool,
      data: result  // Changed from "result" to "data" for n8n MCP Client compatibility
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
