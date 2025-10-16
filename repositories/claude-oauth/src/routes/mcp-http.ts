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
import { getOdooClient } from "@/lib/odoo";

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
      name: "leonobitech-claude-mcp-server",
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
        // === ODOO CRM TOOLS ===
        {
          name: "odoo_get_leads",
          description: "Get leads from Odoo CRM. Returns a list of leads with contact information.",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of leads to return (default: 10, max: 50)"
              },
              stage: {
                type: "string",
                description: "Filter by stage name (e.g., 'New', 'Qualified', 'Proposition')"
              },
              type: {
                type: "string",
                enum: ["lead", "opportunity"],
                description: "Filter by type: 'lead' for leads or 'opportunity' for opportunities"
              }
            }
          }
        },
        {
          name: "odoo_create_lead",
          description: "Create a new lead in Odoo CRM",
          inputSchema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Lead name/title (required)"
              },
              partner_name: {
                type: "string",
                description: "Company/organization name"
              },
              contact_name: {
                type: "string",
                description: "Contact person name"
              },
              email: {
                type: "string",
                description: "Email address"
              },
              phone: {
                type: "string",
                description: "Phone number"
              },
              description: {
                type: "string",
                description: "Lead description or notes"
              },
              expected_revenue: {
                type: "number",
                description: "Expected revenue amount"
              }
            },
            required: ["name"]
          }
        },
        {
          name: "odoo_get_opportunities",
          description: "Get opportunities from Odoo CRM pipeline. Returns opportunities with revenue and stage information.",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of opportunities to return (default: 20, max: 100)"
              },
              stage: {
                type: "string",
                description: "Filter by stage name"
              },
              min_amount: {
                type: "number",
                description: "Minimum expected revenue to filter by"
              }
            }
          }
        },
        {
          name: "odoo_update_deal_stage",
          description: "Move an opportunity to a different stage in the pipeline",
          inputSchema: {
            type: "object",
            properties: {
              opportunity_id: {
                type: "number",
                description: "ID of the opportunity to update (required)"
              },
              stage_name: {
                type: "string",
                description: "Name of the target stage (e.g., 'Won', 'Lost', 'Proposition')"
              }
            },
            required: ["opportunity_id", "stage_name"]
          }
        },
        {
          name: "odoo_convert_to_opportunity",
          description: "Convert leads to opportunities in Odoo CRM. In Odoo 19, leads don't exist as a separate phase - everything should be an opportunity to be visible in the pipeline UI.",
          inputSchema: {
            type: "object",
            properties: {
              lead_ids: {
                type: "array",
                items: { type: "number" },
                description: "Array of lead IDs to convert to opportunities (required)"
              }
            },
            required: ["lead_ids"]
          }
        },
        {
          name: "odoo_search_contacts",
          description: "Search for contacts (customers, suppliers, companies) in Odoo",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query (name, email, or phone)"
              },
              limit: {
                type: "number",
                description: "Maximum number of contacts to return (default: 5, max: 20)"
              }
            },
            required: ["query"]
          }
        },
        {
          name: "odoo_create_contact",
          description: "Create a new contact (customer/supplier) in Odoo",
          inputSchema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Contact/company name (required)"
              },
              email: {
                type: "string",
                description: "Email address"
              },
              phone: {
                type: "string",
                description: "Phone number"
              },
              mobile: {
                type: "string",
                description: "Mobile number"
              },
              is_company: {
                type: "boolean",
                description: "Whether this is a company (true) or individual (false)"
              },
              street: {
                type: "string",
                description: "Street address"
              },
              city: {
                type: "string",
                description: "City"
              },
              website: {
                type: "string",
                description: "Website URL"
              }
            },
            required: ["name"]
          }
        },
        {
          name: "odoo_get_sales_report",
          description: "Get sales report with metrics (revenue, deals won/lost, conversion rate)",
          inputSchema: {
            type: "object",
            properties: {
              period: {
                type: "string",
                enum: ["today", "week", "month", "quarter", "year"],
                description: "Time period for the report (default: 'month')"
              }
            }
          }
        },
        {
          name: "odoo_create_activity",
          description: "Schedule an activity (call, meeting, email, task) in Odoo",
          inputSchema: {
            type: "object",
            properties: {
              activity_type: {
                type: "string",
                enum: ["call", "meeting", "email", "task"],
                description: "Type of activity (required)"
              },
              summary: {
                type: "string",
                description: "Activity summary/title (required)"
              },
              opportunity_id: {
                type: "number",
                description: "Link to opportunity ID (optional)"
              },
              date_deadline: {
                type: "string",
                description: "Deadline date in ISO format (YYYY-MM-DD)"
              },
              note: {
                type: "string",
                description: "Additional notes"
              }
            },
            required: ["activity_type", "summary"]
          }
        }
      ]
    };
  });

  // Handler para ejecutar herramientas
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    logger.info({ userId, tool: request.params.name }, "MCP: call_tool request");

    const args = request.params.arguments || {};
    const odoo = getOdooClient();

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

        // === ODOO TOOLS ===

        case "odoo_get_leads": {
          const limit = Math.min((args.limit as number) || 10, 50);
          const stage = args.stage as string | undefined;
          const type = args.type as "lead" | "opportunity" | undefined;

          const leads = await odoo.getLeads({ limit, stage, type });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    total: leads.length,
                    leads: leads.map((lead) => ({
                      id: lead.id,
                      name: lead.name,
                      partner_name: lead.partner_name || "N/A",
                      contact_name: lead.contact_name || "N/A",
                      email: lead.email_from || "N/A",
                      phone: lead.phone || lead.mobile || "N/A",
                      expected_revenue: lead.expected_revenue || 0,
                      probability: lead.probability || 0,
                      stage: lead.stage_id ? lead.stage_id[1] : "N/A",
                      type: lead.type,
                      created: lead.create_date
                    }))
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        case "odoo_create_lead": {
          const leadData = {
            name: args.name as string,
            partner_name: args.partner_name as string | undefined,
            contact_name: args.contact_name as string | undefined,
            email: args.email as string | undefined,
            phone: args.phone as string | undefined,
            description: args.description as string | undefined,
            expected_revenue: args.expected_revenue as number | undefined,
            type: "lead" as const
          };

          const leadId = await odoo.createLead(leadData);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    lead_id: leadId,
                    message: `Lead created successfully with ID: ${leadId}`,
                    data: leadData
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        case "odoo_get_opportunities": {
          const limit = Math.min((args.limit as number) || 20, 100);
          const stage = args.stage as string | undefined;
          const minAmount = args.min_amount as number | undefined;

          const opportunities = await odoo.getOpportunities({
            limit,
            stage,
            minAmount
          });

          const totalRevenue = opportunities.reduce((sum, opp) => sum + (opp.expected_revenue || 0), 0);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    total: opportunities.length,
                    total_revenue: totalRevenue,
                    opportunities: opportunities.map((opp) => ({
                      id: opp.id,
                      name: opp.name,
                      partner: opp.partner_name || opp.partner_id?.[1] || "N/A",
                      expected_revenue: opp.expected_revenue || 0,
                      probability: opp.probability || 0,
                      stage: opp.stage_id ? opp.stage_id[1] : "N/A",
                      assigned_to: opp.user_id ? opp.user_id[1] : "Unassigned",
                      deadline: opp.date_deadline || "N/A"
                    }))
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        case "odoo_update_deal_stage": {
          const opportunityId = args.opportunity_id as number;
          const stageName = args.stage_name as string;

          await odoo.updateDealStage(opportunityId, stageName);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Opportunity #${opportunityId} moved to stage "${stageName}"`,
                    opportunity_id: opportunityId,
                    new_stage: stageName
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        case "odoo_convert_to_opportunity": {
          const leadIds = args.lead_ids as number[];

          if (!Array.isArray(leadIds) || leadIds.length === 0) {
            throw new Error("lead_ids must be a non-empty array of lead IDs");
          }

          await odoo.convertLeadsToOpportunities(leadIds);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Successfully converted ${leadIds.length} lead(s) to opportunity/opportunities`,
                    converted_ids: leadIds,
                    note: "These leads are now visible as opportunities in your Odoo CRM pipeline"
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        case "odoo_search_contacts": {
          const query = args.query as string;
          const limit = Math.min((args.limit as number) || 5, 20);

          const contacts = await odoo.searchContacts(query, { limit });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    total: contacts.length,
                    query,
                    contacts: contacts.map((contact) => ({
                      id: contact.id,
                      name: contact.name,
                      email: contact.email || "N/A",
                      phone: contact.phone || contact.mobile || "N/A",
                      is_company: contact.is_company,
                      address: [contact.street, contact.city]
                        .filter(Boolean)
                        .join(", ") || "N/A",
                      country: contact.country_id ? contact.country_id[1] : "N/A",
                      website: contact.website || "N/A"
                    }))
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        case "odoo_create_contact": {
          const contactData = {
            name: args.name as string,
            email: args.email as string | undefined,
            phone: args.phone as string | undefined,
            mobile: args.mobile as string | undefined,
            isCompany: args.is_company as boolean | undefined,
            street: args.street as string | undefined,
            city: args.city as string | undefined,
            website: args.website as string | undefined
          };

          const contactId = await odoo.createContact(contactData);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    contact_id: contactId,
                    message: `Contact created successfully with ID: ${contactId}`,
                    data: contactData
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        case "odoo_get_sales_report": {
          const period = (args.period as "today" | "week" | "month" | "quarter" | "year") || "month";

          const report = await odoo.getSalesReport(period);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    period,
                    total_revenue: report.totalRevenue,
                    deals_won: report.dealsWon,
                    deals_lost: report.dealsLost,
                    avg_deal_size: report.avgDealSize,
                    conversion_rate: `${report.conversionRate.toFixed(2)}%`,
                    summary: `In the last ${period}, you won ${report.dealsWon} deals worth $${report.totalRevenue.toLocaleString()} with a ${report.conversionRate.toFixed(1)}% conversion rate.`
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        case "odoo_create_activity": {
          const activityData = {
            activityType: args.activity_type as "call" | "meeting" | "email" | "task",
            summary: args.summary as string,
            resId: args.opportunity_id as number | undefined,
            dateDeadline: args.date_deadline as string | undefined,
            note: args.note as string | undefined
          };

          const activityId = await odoo.createActivity(activityData);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    activity_id: activityId,
                    message: `Activity "${args.summary}" scheduled successfully`,
                    type: activityData.activityType,
                    deadline: activityData.dateDeadline || "No deadline set"
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
    } catch (error) {
      logger.error({ error, tool: request.params.name }, "Error executing Odoo tool");

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
