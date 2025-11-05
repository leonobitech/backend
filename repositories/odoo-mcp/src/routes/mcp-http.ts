import { randomUUID } from "node:crypto";
import { Router } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "@/lib/logger";
import { createMcpServer } from "@/lib/mcp-server";
import { ToolRegistry } from "@/tools/base/ToolRegistry";
import { dualAuth } from "@/middlewares/dual-auth.middleware";

// Store active transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

export const mcpHttpRouter = Router();

/**
 * Endpoint principal MCP con Streamable HTTP
 * Soporta GET, POST y DELETE según la especificación MCP 2025-03-26
 *
 * DUAL AUTHENTICATION:
 * - OAuth Bearer Token (Claude Desktop)
 * - X-Service-Token header (n8n, automation)
 */
mcpHttpRouter.all("/", dualAuth, async (req, res) => {
  const userId = res.locals.auth.subject;
  const authType = res.locals.auth.type;
  const method = req.method;

  logger.info({ userId, authType, method, url: req.originalUrl }, "MCP HTTP request");

  try {
    // Check for existing session ID
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport
      transport = transports.get(sessionId)!;
      logger.info({ userId, sessionId }, "Reusing existing MCP session");
    } else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
      // Create new transport for initialization
      logger.info({ userId }, "Creating new MCP session");

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          logger.info({ userId, sessionId: newSessionId }, "MCP session initialized");
          transports.set(newSessionId, transport);
        }
      });

      // Setup cleanup on close
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports.has(sid)) {
          logger.info({ userId, sessionId: sid }, "MCP transport closed, cleaning up");
          transports.delete(sid);
        }
      };

      // Connect server to transport with ToolRegistry
      const registry = ToolRegistry.getInstance();
      const mcpServer = createMcpServer(userId, registry);
      await mcpServer.connect(transport);
      logger.info({ userId }, "MCP server connected to Streamable HTTP transport");
    } else {
      // Invalid request
      logger.warn({ userId, method, sessionId }, "Invalid MCP request: no session ID or not initialization");
      return res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided or not an initialization request"
        },
        id: null
      });
    }

    // Handle the request with the transport
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error({ err: error, userId }, "Error handling MCP HTTP request");
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error"
        },
        id: null
      });
    }
  }
});
