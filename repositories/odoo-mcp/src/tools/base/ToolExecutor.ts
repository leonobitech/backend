import { ToolRegistry } from "./ToolRegistry";
import { ToolExecutionResult } from "./Tool.interface";
import { logger } from "@/lib/logger";
import { ZodError } from "zod";

/**
 * ToolExecutor
 *
 * Executes tools from the registry with:
 * - Input validation
 * - Error handling
 * - Execution logging
 * - Performance monitoring
 *
 * Usage:
 * ```ts
 * const executor = new ToolExecutor(registry);
 * const result = await executor.execute("odoo_get_leads", { limit: 10 });
 * ```
 */
export class ToolExecutor {
  constructor(private readonly registry: ToolRegistry) {}

  /**
   * Execute a tool by name
   * @param toolName - Name of the tool to execute
   * @param input - Tool input (will be validated)
   * @returns Execution result with success/error status
   */
  async execute<T = unknown>(
    toolName: string,
    input: unknown
  ): Promise<ToolExecutionResult<T>> {
    const startTime = Date.now();

    try {
      // Check if tool exists
      const tool = this.registry.get(toolName);
      if (!tool) {
        logger.warn({ toolName }, "[ToolExecutor] Tool not found");
        return {
          success: false,
          error: {
            code: "TOOL_NOT_FOUND",
            message: `Tool '${toolName}' is not registered`,
            details: {
              availableTools: this.registry.listNames(),
            },
          },
        };
      }

      // Get metadata for logging
      const metadata = this.registry.getMetadata(toolName);

      logger.info(
        {
          toolName,
          category: metadata?.category,
          input: this.sanitizeInput(input),
        },
        "[ToolExecutor] Executing tool"
      );

      // Execute tool
      const result = await tool.execute(input);

      const duration = Date.now() - startTime;

      logger.info(
        {
          toolName,
          duration,
          estimatedTime: metadata?.estimatedTime,
        },
        "[ToolExecutor] Tool executed successfully"
      );

      return {
        success: true,
        data: result as T,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Handle Zod validation errors
      if (error instanceof ZodError) {
        logger.warn(
          {
            toolName,
            duration,
            errors: error.flatten(),
          },
          "[ToolExecutor] Validation error"
        );

        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input parameters",
            details: error.flatten(),
          },
        };
      }

      // Handle tool execution errors
      logger.error(
        {
          toolName,
          duration,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        "[ToolExecutor] Tool execution failed"
      );

      return {
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          details: error instanceof Error ? { stack: error.stack } : undefined,
        },
      };
    }
  }

  /**
   * Execute multiple tools in parallel
   * @param executions - Array of tool executions
   * @returns Array of execution results
   */
  async executeMany<T = unknown>(
    executions: Array<{ toolName: string; input: unknown }>
  ): Promise<Array<ToolExecutionResult<T>>> {
    logger.info(
      { count: executions.length },
      "[ToolExecutor] Executing multiple tools"
    );

    const results = await Promise.all(
      executions.map(({ toolName, input }) =>
        this.execute<T>(toolName, input)
      )
    );

    const successCount = results.filter((r) => r.success).length;
    logger.info(
      {
        total: executions.length,
        successful: successCount,
        failed: executions.length - successCount,
      },
      "[ToolExecutor] Batch execution completed"
    );

    return results;
  }

  /**
   * Validate tool input without executing
   * @param toolName - Name of the tool
   * @param input - Tool input
   * @returns Validation result
   */
  async validate(
    toolName: string,
    input: unknown
  ): Promise<{ valid: boolean; errors?: unknown }> {
    const tool = this.registry.get(toolName);

    if (!tool) {
      return {
        valid: false,
        errors: { message: `Tool '${toolName}' not found` },
      };
    }

    try {
      // Tools should validate input in execute method
      // For now, we just check if the tool exists
      return { valid: true };
    } catch (error) {
      if (error instanceof ZodError) {
        return {
          valid: false,
          errors: error.flatten(),
        };
      }

      return {
        valid: false,
        errors: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Sanitize input for logging (remove sensitive data)
   * @param input - Raw input
   * @returns Sanitized input
   */
  private sanitizeInput(input: unknown): unknown {
    if (typeof input !== "object" || input === null) {
      return input;
    }

    const sensitiveKeys = [
      "password",
      "token",
      "apiKey",
      "api_key",
      "secret",
      "authorization",
    ];

    const sanitized = { ...input } as Record<string, unknown>;

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        sanitized[key] = "[REDACTED]";
      }
    }

    return sanitized;
  }
}
