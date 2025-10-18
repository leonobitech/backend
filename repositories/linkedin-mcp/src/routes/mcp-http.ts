import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response, Router } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  isInitializeRequest
} from "@modelcontextprotocol/sdk/types.js";
import { env } from "@/config/env";
import { verifyAccessToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as linkedin from "@/lib/linkedin";

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

/**
 * Crea un servidor MCP con las herramientas disponibles
 */
function createMcpServer(userId: string): Server {
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
        },
        // === LINKEDIN HR RECRUITING TOOLS ===
        {
          name: "linkedin_extract_profiles",
          description: "Extract and analyze LinkedIn profiles from URLs. Paste LinkedIn profile URLs and get structured candidate data with skills, experience, and background.",
          inputSchema: {
            type: "object",
            properties: {
              profile_urls: {
                type: "array",
                items: { type: "string" },
                description: "Array of LinkedIn profile URLs to extract (e.g., ['https://linkedin.com/in/johndoe', 'https://linkedin.com/in/janedoe'])"
              }
            },
            required: ["profile_urls"]
          }
        },
        {
          name: "linkedin_rank_candidates",
          description: "Rank candidates using AI scoring based on job requirements. Analyzes skills match, experience level, and cultural fit.",
          inputSchema: {
            type: "object",
            properties: {
              candidate_ids: {
                type: "array",
                items: { type: "string" },
                description: "Array of candidate IDs from previous extract_profiles call"
              },
              job_description: {
                type: "string",
                description: "Full job description with responsibilities and requirements"
              },
              required_skills: {
                type: "array",
                items: { type: "string" },
                description: "Must-have skills (e.g., ['React', 'TypeScript', 'Node.js'])"
              },
              nice_to_have: {
                type: "array",
                items: { type: "string" },
                description: "Nice-to-have skills (optional)"
              }
            },
            required: ["candidate_ids", "job_description", "required_skills"]
          }
        },
        {
          name: "linkedin_generate_message",
          description: "Generate personalized InMail or connection request message for a candidate using AI. Creates custom messages based on candidate profile and job details.",
          inputSchema: {
            type: "object",
            properties: {
              candidate_id: {
                type: "string",
                description: "Candidate ID from extract_profiles"
              },
              job_description: {
                type: "string",
                description: "Job description"
              },
              company_info: {
                type: "string",
                description: "Brief company description and value proposition"
              },
              tone: {
                type: "string",
                enum: ["professional", "casual", "enthusiastic"],
                description: "Message tone (default: 'professional')"
              }
            },
            required: ["candidate_id", "job_description", "company_info"]
          }
        },
        {
          name: "linkedin_send_inmail",
          description: "Send an InMail message to a LinkedIn user. NOTE: Requires LinkedIn Premium or Recruiter account. Rate limited to ~100 InMails/month on free tier.",
          inputSchema: {
            type: "object",
            properties: {
              profile_url: {
                type: "string",
                description: "LinkedIn profile URL of the recipient"
              },
              subject: {
                type: "string",
                description: "InMail subject line"
              },
              message: {
                type: "string",
                description: "InMail message body (personalized)"
              }
            },
            required: ["profile_url", "subject", "message"]
          }
        },
        {
          name: "linkedin_track_responses",
          description: "Track responses to InMails sent. Check which candidates replied and their response status.",
          inputSchema: {
            type: "object",
            properties: {
              message_ids: {
                type: "array",
                items: { type: "string" },
                description: "Array of message IDs from send_inmail calls"
              }
            },
            required: ["message_ids"]
          }
        }
      ]
    };
  });

  // Handler para ejecutar herramientas
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    logger.info({ userId, tool: request.params.name }, "MCP: call_tool request");

    const args = request.params.arguments || {};

    try {
      switch (request.params.name) {
        case "ping": {
          const message = (args.message as string) || "pong";
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


        // === LINKEDIN HR RECRUITING TOOLS ===

        case "linkedin_extract_profiles": {
          const profileUrls = args.profile_urls as string[];

          if (!Array.isArray(profileUrls) || profileUrls.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, "profile_urls must be a non-empty array");
          }

          const profiles = await linkedin.extractProfilesFromUrls({ profileUrls });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                total: profiles.length,
                profiles: profiles.map(p => ({
                  id: p.id,
                  name: `${p.firstName} ${p.lastName}`,
                  headline: p.headline,
                  location: p.location,
                  profileUrl: p.profileUrl,
                  skills: p.skills,
                  experience: p.experience
                }))
              }, null, 2)
            }]
          };
        }

        case "linkedin_rank_candidates": {
          const candidateIds = args.candidate_ids as string[];
          const jobDescription = args.job_description as string;
          const requiredSkills = args.required_skills as string[];
          const niceToHave = args.nice_to_have as string[] | undefined;

          if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, "candidate_ids must be a non-empty array");
          }
          if (!jobDescription) {
            throw new McpError(ErrorCode.InvalidParams, "job_description is required");
          }
          if (!Array.isArray(requiredSkills)) {
            throw new McpError(ErrorCode.InvalidParams, "required_skills must be an array");
          }

          // First extract profiles again (in real implementation, would cache them)
          const profiles = await linkedin.extractProfilesFromUrls({
            profileUrls: candidateIds.map(id => `https://linkedin.com/in/${id}`)
          });

          const rankedCandidates = await linkedin.rankCandidates({
            candidates: profiles,
            jobDescription,
            requiredSkills,
            niceToHave
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                total: rankedCandidates.length,
                candidates: rankedCandidates.map(c => ({
                  id: c.id,
                  name: `${c.firstName} ${c.lastName}`,
                  score: c.score,
                  reasoning: c.reasoning,
                  headline: c.headline,
                  skills: c.skills
                }))
              }, null, 2)
            }]
          };
        }

        case "linkedin_generate_message": {
          const candidateId = args.candidate_id as string;
          const jobDescription = args.job_description as string;
          const companyInfo = args.company_info as string;
          const tone = (args.tone as "professional" | "casual" | "enthusiastic") || "professional";

          if (!candidateId) {
            throw new McpError(ErrorCode.InvalidParams, "candidate_id is required");
          }
          if (!jobDescription) {
            throw new McpError(ErrorCode.InvalidParams, "job_description is required");
          }
          if (!companyInfo) {
            throw new McpError(ErrorCode.InvalidParams, "company_info is required");
          }

          // Extract profile (in real implementation, would use cached data)
          const profiles = await linkedin.extractProfilesFromUrls({
            profileUrls: [`https://linkedin.com/in/${candidateId}`]
          });

          if (profiles.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, "Candidate not found");
          }

          const message = await linkedin.generatePersonalizedMessage({
            candidateProfile: profiles[0],
            jobDescription,
            companyInfo,
            tone
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                candidate: `${profiles[0].firstName} ${profiles[0].lastName}`,
                tone,
                message
              }, null, 2)
            }]
          };
        }

        case "linkedin_send_inmail": {
          const profileUrl = args.profile_url as string;
          const subject = args.subject as string;
          const message = args.message as string;

          if (!profileUrl) {
            throw new McpError(ErrorCode.InvalidParams, "profile_url is required");
          }
          if (!subject) {
            throw new McpError(ErrorCode.InvalidParams, "subject is required");
          }
          if (!message) {
            throw new McpError(ErrorCode.InvalidParams, "message is required");
          }

          const result = await linkedin.sendInMail({
            profileUrl,
            subject,
            message
          });

          if (!result.success) {
            throw new McpError(ErrorCode.InternalError, result.error || "Failed to send InMail");
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: result.messageId,
                recipient: profileUrl,
                message: "✅ InMail sent successfully"
              }, null, 2)
            }]
          };
        }

        case "linkedin_track_responses": {
          const messageIds = args.message_ids as string[];

          if (!Array.isArray(messageIds) || messageIds.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, "message_ids must be a non-empty array");
          }

          const responses = await linkedin.trackInMailResponses(messageIds);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                total: responses.length,
                responded: responses.filter(r => r.replied).length,
                responseRate: `${((responses.filter(r => r.replied).length / responses.length) * 100).toFixed(1)}%`,
                responses: responses.map(r => ({
                  messageId: r.messageId,
                  status: r.replied ? "replied" : "pending",
                  replyText: r.replyText
                }))
              }, null, 2)
            }]
          };
        }
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      logger.error({ error, tool: request.params.name }, "Error executing LinkedIn HR tool");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: true,
                message: error instanceof Error ? error.message : "Unknown error occurred",
                tool: request.params.name
              },
              null,
              2
            )
          }
        ]
      };
    }
  });

  return server;
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

      // Connect server to transport
      const mcpServer = createMcpServer(userId);
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
