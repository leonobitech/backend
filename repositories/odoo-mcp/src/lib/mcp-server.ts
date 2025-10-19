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

/**
 * Create an MCP server instance with registered tools
 * @param userId - User identifier for logging
 * @param registry - ToolRegistry with registered tools
 * @returns Configured MCP Server instance
 */
export function createMcpServer(userId: string, registry: ToolRegistry): Server {
  const executor = new ToolExecutor(registry);

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

    // Get all Odoo tool definitions from registry
    const tools = registry.listDefinitions();

    logger.info({ userId, toolCount: tools.length }, "[MCP] Returning tool list");

    return { tools };
  });

  // Handler: Execute tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments || {};

    logger.info({ userId, toolName }, "[MCP] call_tool request");

    try {
      // Handle all Odoo tools through registry and executor
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
