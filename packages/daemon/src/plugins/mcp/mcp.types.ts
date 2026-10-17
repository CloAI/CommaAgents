import type { McpServerEntry, McpServerSource } from "@comma-agents/core/mcp";
import type { RunRepository } from "../../daemon-run-state/run-repository";
import type { NotifyingPlugin } from "../../daemon-plugin";
import type { RunsPlugin } from "../runs";
import type { McpNotifications } from "./mcp.notifications";

/** MCP configuration, assignment, and connection state safe to display. */
export interface RunMcpServerStatus {
  /** Stable server identifier. */
  readonly id: string;
  /** Effective configuration source. */
  readonly source: McpServerSource;
  /** Configured transport. */
  readonly transport: McpServerEntry["definition"]["transport"];
  /** Selection for the next preparation. */
  readonly enabled: boolean;
  /** Default selection in the discovered configuration. */
  readonly enabledByDefault: boolean;
  /** Whether this execution currently has a connection, when preparation was attempted. */
  readonly connected?: boolean;
  /** Number of available tools in the current connection. */
  readonly toolCount: number;
  /** Agents assigned to this server. */
  readonly assignedAgents: readonly string[];
  /** Connection error, when applicable. */
  readonly error?: string;
}

/** Inputs for inspecting shared or execution-specific MCP servers. */
export interface ListMcpServersOptions {
  /** Execution whose selection and connection state are requested. */
  readonly runId?: string;
  /** Strategy to inspect; defaults to the execution's strategy. */
  readonly strategyPath?: string;
  /** Workspace to inspect; defaults to the execution's directory or process cwd. */
  readonly cwd?: string;
}

/** Persist a server's shared default or execution-specific selection. */
export interface UpdateMcpServerOptions extends ListMcpServersOptions {
  /** Server to enable or disable. */
  readonly serverId: string;
  /** Selection to persist for future preparation. */
  readonly enabled: boolean;
  /** Shared default, or an execution override requiring runId. */
  readonly scope: "default" | "run";
}

/** Dependencies for execution preparation and persisted server choices. */
export interface CreateMcpPluginOptions {
  /** Services supplied by the daemon. */
  readonly dependencies: {
    /** Preparation, snapshots, and execution ancestry APIs. */
    readonly runs: RunsPlugin;
    /** Repository storing per-execution server choices. */
    readonly runRepository: RunRepository;
  };
}

/** MCP discovery, server selection, and execution-owned client cleanup. */
export interface McpPlugin extends NotifyingPlugin<"mcp", McpNotifications> {
  /** List configured servers and active connection outcomes without connecting new clients. */
  listServers(
    options?: ListMcpServersOptions,
  ): Promise<readonly RunMcpServerStatus[]>;
  /** Persist a selection for the next preparation; active connections keep their current tools. */
  updateServer(
    options: UpdateMcpServerOptions,
  ): Promise<readonly RunMcpServerStatus[]>;
}
