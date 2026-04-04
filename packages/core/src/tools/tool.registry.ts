// Tool registry — global mutable registry for custom tools and resolution.
//
// Mirrors the registerProvider() / unregisterProvider() pattern in defaults/.
// Built-in tools are always available; custom tools registered here extend
// the set of names that resolveTools() can resolve.

import { StrategyValidationError } from "../errors/index";
import { BUILT_IN_TOOL_FACTORIES, BUILT_IN_TOOL_NAMES } from "./tool.constants";
import type { ToolDefinition } from "./tool.types";

// -- Module state --

/** Custom tool registrations (user-registered, not built-in). */
let toolRegistry = new Map<string, ToolDefinition>();

// -- Public API --

/**
 * Register a custom tool with the global tool registry.
 *
 * Registered tools can be referenced by name in agent definitions
 * (strategy files, agent descriptions, or programmatic config).
 * They are resolved by `resolveTools()` after checking the built-in
 * tool set.
 *
 * Registering a name that matches a built-in tool will shadow the
 * built-in — the custom tool takes precedence.
 *
 * @example
 * ```ts
 * import { registerTool, defineTool } from "@comma-agents/core";
 *
 * const myTool = defineTool({
 *   description: "Fetch a URL",
 *   parameters: z.object({ url: z.string() }),
 *   execute: async ({ url }) => ({ output: await fetch(url).then(r => r.text()) }),
 * });
 *
 * registerTool("fetch", myTool);
 * ```
 */
export function registerTool(name: string, tool: ToolDefinition): void {
  toolRegistry.set(name, tool);
}

/**
 * Remove a previously registered custom tool.
 * Returns `true` if the tool was registered and removed.
 * Built-in tools cannot be unregistered via this function.
 */
export function unregisterTool(name: string): boolean {
  return toolRegistry.delete(name);
}

/**
 * Resolve an array of tool name strings into a `Record<string, ToolDefinition>`.
 *
 * Resolution order for each name:
 * 1. Global tool registry (custom tools via `registerTool()`)
 * 2. Built-in tool factories (`bash`, `read`, `write`, `edit`, `glob`, `grep`)
 * 3. Explicit `customTools` parameter (passed by the strategy loader / description loader)
 * 4. Error — unknown tool name
 *
 * Custom registry tools shadow built-in tools of the same name.
 *
 * @throws {StrategyValidationError} If a tool name cannot be resolved.
 */
export function resolveTools(
  toolNames: readonly string[],
  agentName: string,
  customTools?: Readonly<Record<string, ToolDefinition>>,
): Record<string, ToolDefinition> {
  const tools: Record<string, ToolDefinition> = {};

  for (const name of toolNames) {
    // 1. Check global registry (custom tools shadow built-ins)
    const registered = toolRegistry.get(name);
    if (registered) {
      tools[name] = registered;
      continue;
    }

    // 2. Check built-in
    const builtInFactory = BUILT_IN_TOOL_FACTORIES[name];
    if (builtInFactory) {
      tools[name] = builtInFactory();
      continue;
    }

    // 3. Check explicit custom tools (legacy: passed by strategy loader)
    const custom = customTools?.[name];
    if (custom) {
      tools[name] = custom;
      continue;
    }

    // 4. Unknown tool
    const registeredList = [...toolRegistry.keys()];
    const builtInList = BUILT_IN_TOOL_NAMES.join(", ");
    const customList = customTools ? Object.keys(customTools).join(", ") : "(none)";
    const registeredDisplay = registeredList.length > 0 ? registeredList.join(", ") : "(none)";
    throw new StrategyValidationError(
      `Agent "${agentName}" references unknown tool "${name}". ` +
        `Built-in tools: [${builtInList}]. ` +
        `Registered tools: [${registeredDisplay}]. ` +
        `Custom tools: [${customList}].`,
    );
  }

  return tools;
}

/**
 * Get the list of currently registered custom tool names.
 * Does not include built-in tools.
 */
export function getRegisteredToolNames(): readonly string[] {
  return [...toolRegistry.keys()];
}

/**
 * Reset the global tool registry to empty state.
 * Primarily for tests.
 */
export function resetToolRegistry(): void {
  toolRegistry = new Map();
}
