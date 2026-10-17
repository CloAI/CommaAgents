import type { McpServerEntry } from "@comma-agents/core/mcp";
import type { RunRepository } from "../../../daemon-run-state/run-repository";

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
  readonly runId?: string;
  readonly runRepository: RunRepository;
  readonly persistDefaults?: boolean;
}
