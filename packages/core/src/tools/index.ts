// Tools module barrel — single import point for tool internals.
// Public API is exported from the package index.

// Built-in tool factories
export type {
  BashToolConfig,
  DefaultToolsConfig,
  GlobToolConfig,
  GrepToolConfig,
  ReadToolConfig,
} from "./built-in/index";
export {
  createBashTool,
  createDefaultTools,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createReadTool,
  createWriteTool,
} from "./built-in/index";

// Core types and factory
export { defineTool } from "./define/define-tool";
// Tool registry
export {
  getRegisteredToolNames,
  registerTool,
  resetToolRegistry,
  resolveTools,
  unregisterTool,
} from "./tool.registry";
export type { ToolContext, ToolDefinition as ToolDef, ToolResult } from "./tool.types";
