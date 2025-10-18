import { ITool, ToolDefinition, ToolMetadata } from "./Tool.interface";
import { logger } from "@/lib/logger";

/**
 * Registered tool entry
 */
interface RegisteredTool {
  instance: ITool;
  definition: ToolDefinition;
  metadata?: ToolMetadata;
}

/**
 * ToolRegistry
 *
 * Central registry for all MCP tools. Provides:
 * - Tool registration
 * - Tool lookup by name
 * - Tool listing for MCP protocol
 * - Tool metadata management
 *
 * Usage:
 * ```ts
 * const registry = ToolRegistry.getInstance();
 * registry.register(new GetLeadsTool(odooClient));
 * const tool = registry.get("odoo_get_leads");
 * ```
 */
export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, RegisteredTool> = new Map();

  private constructor() {
    logger.info("[ToolRegistry] Initialized");
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  /**
   * Register a tool
   * @param tool - Tool instance implementing ITool
   * @param metadata - Optional tool metadata
   */
  register(tool: ITool, metadata?: ToolMetadata): void {
    const definition = tool.definition();

    if (this.tools.has(definition.name)) {
      logger.warn(
        { toolName: definition.name },
        "[ToolRegistry] Tool already registered, overwriting"
      );
    }

    this.tools.set(definition.name, {
      instance: tool,
      definition,
      metadata,
    });

    logger.info(
      {
        toolName: definition.name,
        category: metadata?.category,
        version: metadata?.version,
      },
      "[ToolRegistry] Tool registered"
    );
  }

  /**
   * Get tool by name
   * @param name - Tool name
   * @returns Tool instance or undefined
   */
  get(name: string): ITool | undefined {
    return this.tools.get(name)?.instance;
  }

  /**
   * Get tool definition by name
   * @param name - Tool name
   * @returns Tool definition or undefined
   */
  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  /**
   * Get tool metadata by name
   * @param name - Tool name
   * @returns Tool metadata or undefined
   */
  getMetadata(name: string): ToolMetadata | undefined {
    return this.tools.get(name)?.metadata;
  }

  /**
   * Check if tool exists
   * @param name - Tool name
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tool names
   */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all tool definitions (for MCP tools/list)
   */
  listDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Get all tools with metadata
   */
  listAll(): Array<{
    definition: ToolDefinition;
    metadata?: ToolMetadata;
  }> {
    return Array.from(this.tools.values()).map(({ definition, metadata }) => ({
      definition,
      metadata,
    }));
  }

  /**
   * Unregister a tool
   * @param name - Tool name
   */
  unregister(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      logger.info({ toolName: name }, "[ToolRegistry] Tool unregistered");
    }
    return existed;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    const count = this.tools.size;
    this.tools.clear();
    logger.info({ count }, "[ToolRegistry] All tools cleared");
  }

  /**
   * Get registry stats
   */
  getStats(): {
    totalTools: number;
    toolsByCategory: Record<string, number>;
  } {
    const totalTools = this.tools.size;
    const toolsByCategory: Record<string, number> = {};

    for (const { metadata } of this.tools.values()) {
      if (metadata?.category) {
        toolsByCategory[metadata.category] =
          (toolsByCategory[metadata.category] || 0) + 1;
      }
    }

    return { totalTools, toolsByCategory };
  }
}
