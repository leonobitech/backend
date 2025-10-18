/**
 * MCP Server Factory
 *
 * Creates MCP servers with tool registry integration
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "@/lib/logger";
import { ToolRegistry } from "@/tools/base/ToolRegistry";
import { ToolExecutor } from "@/tools/base/ToolExecutor";
import { getOdooClient } from "@/lib/odoo";

/**
 * Create an MCP server instance with registered tools
 * @param userId - User identifier for logging
 * @param registry - ToolRegistry with registered tools
 * @returns Configured MCP Server instance
 */
export function createMcpServer(userId: string, registry: ToolRegistry): Server {
  const executor = new ToolExecutor(registry);
  const odoo = getOdooClient();

  const server = new Server(
    {
      name: "leonobitech-odoo-mcp",
      version: "2.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handler: List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.info({ userId }, "[MCP] list_tools request");

    // Get all tool definitions from registry
    const toolDefinitions = registry.listDefinitions();

    // Add built-in ping and get_user_info tools
    const tools = [
      {
        name: "ping",
        description: "Returns a pong message to test connectivity",
        inputSchema: {
          type: "object" as const,
          properties: {
            message: {
              type: "string",
              description: "Optional message to echo back",
            },
          },
        },
      },
      {
        name: "get_user_info",
        description: "Returns information about the authenticated user",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      ...toolDefinitions,
    ];

    logger.info({ userId, toolCount: tools.length }, "[MCP] Returning tool list");

    return { tools };
  });

  // Handler: Execute tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments || {};

    logger.info({ userId, toolName }, "[MCP] call_tool request");

    try {
      // Handle built-in tools
      if (toolName === "ping") {
        const message = (args.message as string) || "pong";
        return {
          content: [
            {
              type: "text",
              text: `🏓 ${message}`,
            },
          ],
        };
      }

      if (toolName === "get_user_info") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  userId,
                  serverVersion: "2.0.0",
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Handle Odoo tools through registry and executor
      if (toolName.startsWith("odoo_")) {
        const result = await executor.execute(toolName, args);

        if (!result.success) {
          logger.warn(
            { userId, toolName, error: result.error },
            "[MCP] Tool execution failed"
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: true,
                    code: result.error?.code,
                    message: result.error?.message,
                    details: result.error?.details,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        logger.info({ userId, toolName }, "[MCP] Tool executed successfully");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      }

      // Handle legacy Odoo tools (temporarily)
      // TODO: Remove once all tools are modularized
      const legacyResult = await executeLegacyTool(toolName, args, odoo);
      if (legacyResult) {
        return legacyResult;
      }

      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    } catch (error) {
      logger.error({ userId, toolName, error }, "[MCP] Error executing tool");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: true,
                message: error instanceof Error ? error.message : "Unknown error occurred",
                tool: toolName,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  });

  return server;
}

/**
 * Execute legacy Odoo tools (temporary until all are modularized)
 * Returns null if tool not found
 */
async function executeLegacyTool(
  toolName: string,
  args: Record<string, unknown>,
  odoo: ReturnType<typeof getOdooClient>
): Promise<{ content: Array<{ type: string; text: string }> } | null> {
  // Placeholder for legacy tools
  // In next step, we'll add the remaining 6 tools here temporarily
  // until they're modularized

  return null;
}
