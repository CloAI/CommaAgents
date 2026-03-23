// Built-in tools barrel export

export type { BashToolConfig } from "./bash/bash";
export { createBashTool } from "./bash/bash";
export { createEditTool } from "./edit/edit";
export type { GlobToolConfig } from "./glob/glob";
export { createGlobTool } from "./glob/glob";
export type { GrepToolConfig } from "./grep/grep";
export { createGrepTool } from "./grep/grep";
export type { ReadToolConfig } from "./read/read";
export { createReadTool } from "./read/read";
export { createWriteTool } from "./write/write";

// -- Convenience: create all default tools at once --

import type { ToolDef } from "../tool.types";
import type { BashToolConfig } from "./bash/bash";
import { createBashTool } from "./bash/bash";
import { createEditTool } from "./edit/edit";
import type { GlobToolConfig } from "./glob/glob";
import { createGlobTool } from "./glob/glob";
import type { GrepToolConfig } from "./grep/grep";
import { createGrepTool } from "./grep/grep";
import type { ReadToolConfig } from "./read/read";
import { createReadTool } from "./read/read";
import { createWriteTool } from "./write/write";

/**
 * Configuration for the default tool set.
 */
export interface DefaultToolsConfig {
  /** Configuration for the bash tool. */
  readonly bash?: BashToolConfig;
  /** Configuration for the read tool. */
  readonly read?: ReadToolConfig;
  /** Configuration for the glob tool. */
  readonly glob?: GlobToolConfig;
  /** Configuration for the grep tool. */
  readonly grep?: GrepToolConfig;
}

/**
 * Create the standard set of built-in tools for an agent.
 *
 * Returns a `Record<string, ToolDef>` with bash, read, write, edit, glob, and grep tools,
 * ready to pass directly to `createAgent({ tools })`.
 *
 * @example
 * ```ts
 * import { createAgent, createDefaultTools } from "@comma-agents/core";
 *
 * const tools = createDefaultTools();
 * const agent = createAgent({
 *   name: "coder",
 *   model: myModel,
 *   tools,
 * });
 * ```
 *
 * @example
 * ```ts
 * // With custom configuration
 * const tools = createDefaultTools({
 *   bash: { defaultTimeout: 60_000 },
 *   read: { defaultLimit: 500 },
 *   grep: { maxResults: 50 },
 * });
 * ```
 */
export function createDefaultTools(config?: DefaultToolsConfig): Record<string, ToolDef> {
  return {
    bash: createBashTool(config?.bash),
    read: createReadTool(config?.read),
    write: createWriteTool(),
    edit: createEditTool(),
    glob: createGlobTool(config?.glob),
    grep: createGrepTool(config?.grep),
  };
}
