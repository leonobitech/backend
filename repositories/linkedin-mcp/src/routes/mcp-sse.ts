import { NextFunction, Request, Response, Router } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { env } from "@/config/env";
import { verifyAccessToken } from "@/lib/auth";
import { logger } from "@/lib/logger";

const requiredScopes = new Set(env.SCOPES.split(/\s+/).filter(Boolean));

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

/**
 * Crea una instancia del servidor MCP con las herramientas disponibles
 */
function createMcpServer(userId: string) {
  const server = new Server(
    {
      name: "linkedin-hr-mcp-server",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Handler para listar herramientas disponibles
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.info({ userId }, "MCP: list_tools request");
    return {
      tools: [
        {
          name: "ping",
          description: "Returns a pong message to test connectivity",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "Optional message to echo back"
              }
            }
          }
        },
        {
          name: "get_user_info",
          description: "Returns information about the authenticated user",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    };
  });

  // Handler para ejecutar herramientas
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    logger.info({ userId, tool: request.params.name }, "MCP: call_tool request");

    switch (request.params.name) {
      case "ping": {
        const message = (request.params.arguments?.message as string) || "pong";
        return {
          content: [
            {
              type: "text",
              text: `🏓 ${message}`
            }
          ]
        };
      }

      case "get_user_info": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  userId,
                  serverVersion: "0.1.0",
                  timestamp: new Date().toISOString()
                },
                null,
                2
              )
            }
          ]
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
  });

  return server;
}

export const mcpSseRouter = Router();

/**
 * Endpoint SSE para Claude Desktop
 * Claude Desktop se conecta a este endpoint y mantiene la conexión abierta
 */
mcpSseRouter.get("/sse", authenticateMcpRequest, async (req, res) => {
  const userId = res.locals.auth.subject;
  logger.info({ userId }, "MCP SSE connection established");

  // Configurar headers SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Crear servidor MCP para este usuario
  const mcpServer = createMcpServer(userId);

  // Crear transporte SSE
  const transport = new SSEServerTransport("/message", res);

  // Conectar el servidor al transporte
  await mcpServer.connect(transport);

  logger.info({ userId }, "MCP server connected to SSE transport");

  // Cleanup cuando se cierra la conexión
  req.on("close", () => {
    logger.info({ userId }, "MCP SSE connection closed");
    mcpServer.close().catch((err) => {
      logger.error({ err, userId }, "Error closing MCP server");
    });
  });
});

/**
 * Endpoint POST para recibir mensajes del cliente MCP
 * Claude Desktop envía mensajes JSON-RPC a este endpoint
 */
mcpSseRouter.post("/message", authenticateMcpRequest, async (req, res) => {
  const userId = res.locals.auth.subject;
  logger.info({ userId, message: req.body }, "MCP message received");

  // Este endpoint es manejado por el SSEServerTransport
  // Solo necesitamos enviar un 202 Accepted
  res.status(202).send();
});
