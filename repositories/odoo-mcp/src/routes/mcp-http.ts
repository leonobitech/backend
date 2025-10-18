import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response, Router } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { env } from "@/config/env";
import { verifyAccessToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { createMcpServer } from "@/lib/mcp-server";
import { ToolRegistry } from "@/tools/base/ToolRegistry";

const requiredScopes = new Set(env.SCOPES.split(/\s+/).filter(Boolean));

// Store active transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Middleware para autenticar peticiones MCP mediante Bearer token
 */
async function authenticateMcpRequest(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer realm="${env.PUBLIC_URL}", error="invalid_request", error_uri="${env.PUBLIC_URL}/.well-known/oauth-protected-resource"`
    );
    return res.status(401).json({ error: "invalid_request", message: "Missing bearer token" });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer realm="${env.PUBLIC_URL}", error="invalid_request", error_uri="${env.PUBLIC_URL}/.well-known/oauth-protected-resource"`
    );
    return res.status(401).json({ error: "invalid_request", message: "Missing bearer token" });
  }

  try {
    const payload = await verifyAccessToken(token);
    const tokenScopes = new Set(
      typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : []
    );
    const missingScopes = Array.from(requiredScopes).filter((scope) => !tokenScopes.has(scope));
    if (missingScopes.length > 0) {
      logger.warn({ sub: payload.sub, missingScopes }, "Token missing required MCP scopes");
      res.setHeader(
        "WWW-Authenticate",
        `Bearer realm="${env.PUBLIC_URL}", error="insufficient_scope", scope="${env.SCOPES}", error_uri="${env.PUBLIC_URL}/.well-known/oauth-protected-resource"`
      );
      return res.status(403).json({ error: "insufficient_scope", scope: env.SCOPES });
    }

    res.locals.auth = {
      subject: payload.sub,
      scope: payload.scope,
      token
    };
    return next();
  } catch (error) {
    logger.warn({ err: error }, "Failed to verify MCP access token");
    res.setHeader(
      "WWW-Authenticate",
      `Bearer realm="${env.PUBLIC_URL}", error="invalid_token", error_uri="${env.PUBLIC_URL}/.well-known/oauth-protected-resource"`
    );
    return res.status(401).json({ error: "invalid_token" });
  }
}

export const mcpHttpRouter = Router();

/**
 * Endpoint principal MCP con Streamable HTTP
 * Soporta GET, POST y DELETE según la especificación MCP 2025-03-26
 */
mcpHttpRouter.all("/", authenticateMcpRequest, async (req, res) => {
  const userId = res.locals.auth.subject;
  const method = req.method;

  logger.info({ userId, method, url: req.originalUrl, headers: req.headers }, "MCP HTTP request");

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
