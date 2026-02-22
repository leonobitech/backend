import { z } from "zod";

/**
 * Base interface for all MCP tools
 *
 * Every tool must implement this interface to be registered
 * in the ToolRegistry and executed by the ToolExecutor.
 */
export interface ITool<TInput = unknown, TOutput = unknown> {
  /**
   * Execute the tool with validated input
   * @param input - Tool input (will be validated against schema)
   * @returns Tool output
   */
  execute(input: TInput): Promise<TOutput>;

  /**
   * Get tool definition for MCP protocol
   * @returns Tool metadata and input schema
   */
  definition(): ToolDefinition;
}

/**
 * Tool definition for MCP protocol
 */
export interface ToolDefinition {
  /** Unique tool name (e.g., "odoo_get_leads") */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for tool input validation */
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Tool metadata for registration
 */
export interface ToolMetadata {
  /** Tool category (e.g., "odoo/crm", "odoo/calendar") */
  category: string;

  /** Tool version */
  version: string;

  /** Required OAuth scopes */
  requiredScopes: string[];

  /** Estimated execution time (ms) */
  estimatedTime?: number;
}
