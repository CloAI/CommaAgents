import type { McpServerEntry } from "@comma-agents/core/mcp";

/** @internal Layered server definitions, agent assignments, and persisted selection. */
export interface ResolvedMcpConfiguration {
  readonly servers: ReadonlyMap<string, McpServerEntry>;
  readonly assignments: ReadonlyMap<string, readonly string[]>;
  readonly enabledServerIds: readonly string[];
}

/** @internal Configuration resolution inputs for discovery and preparation. */
export interface ResolveMcpConfigurationOptions {
  readonly strategyPath?: string;
  readonly cwd: string;
  readonly overrides?: Readonly<Record<string, boolean>>;
}
