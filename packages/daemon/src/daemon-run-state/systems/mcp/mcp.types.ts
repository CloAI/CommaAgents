import type {
  McpAgentToolSet,
  McpConnectionManager,
  McpServerEntry,
  McpServerSource,
} from "@comma-agents/core/mcp";
import type { RunRepository } from "../../run-repository";

/** MCP server state exposed by run preparation and management protocol messages. */
export interface RunMcpServerStatus {
  /** Stable server identifier. */
  readonly id: string;
  /** Configuration source that defined the server. */
  readonly source: McpServerSource;
  /** Transport used to connect to the server. */
  readonly transport: McpServerEntry["definition"]["transport"];
  /** Whether this server is enabled for the selected run or defaults. */
  readonly enabled: boolean;
  /** Whether the discovered configuration enables the server by default. */
  readonly enabledByDefault: boolean;
  /** Whether the run established a connection, when preparation was attempted. */
  readonly connected?: boolean;
  /** Number of tools discovered from the server. */
  readonly toolCount: number;
  /** Agents that receive tools from this server. */
  readonly assignedAgents: readonly string[];
  /** Safe connection error message when preparation could not connect. */
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
  readonly runRepository: RunRepository;
  readonly persistDefaults?: boolean;
}

/** MCP runtime values stored by the daemon system for a prepared run. */
export interface RunMcpRuntime {
  readonly manager: McpConnectionManager;
  readonly toolsByAgent: Readonly<Record<string, McpAgentToolSet>>;
  readonly statuses: readonly RunMcpServerStatus[];
}
