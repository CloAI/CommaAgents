import type {
  McpAgentToolSet,
  McpConnectionManager,
  McpServerEntry,
  McpServerSource,
} from "@comma-agents/core";
import type { RunStore } from "../run-store";

/** MCP server state exposed by run preparation and management protocol messages. */
export interface RunMcpServerStatus {
  readonly id: string;
  readonly source: McpServerSource;
  readonly transport: McpServerEntry["definition"]["transport"];
  readonly enabled: boolean;
  readonly enabledByDefault: boolean;
  readonly connected?: boolean;
  readonly toolCount: number;
  readonly assignedAgents: readonly string[];
  readonly error?: string;
}

/** Effective MCP configuration resolved for one strategy execution. */
export interface ResolvedRunMcpConfig {
  readonly servers: ReadonlyMap<string, McpServerEntry>;
  readonly assignments: ReadonlyMap<string, readonly string[]>;
  readonly enabledServerIds: readonly string[];
}

/** Dependencies for resolving MCP configuration for a run. */
export interface ResolveRunMcpConfigOptions {
  readonly strategyPath?: string;
  readonly cwd: string;
  readonly runId?: string;
  readonly runStore: RunStore;
  readonly persistDefaults?: boolean;
}

/** MCP runtime values stored by the daemon system for a prepared run. */
export interface RunMcpRuntime {
  readonly manager: McpConnectionManager;
  readonly toolsByAgent: Readonly<Record<string, McpAgentToolSet>>;
  readonly statuses: readonly RunMcpServerStatus[];
}
