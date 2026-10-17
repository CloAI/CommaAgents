import type { McpConnectionManager } from "@comma-agents/core/mcp";
import type { PluginNotifications } from "../../../daemon-plugin";
import type { RunPreparationResult, RunsPlugin } from "../../runs";
import type { RunRepository } from "../../../daemon-run-state/run-repository";
import type { McpNotifications, McpServersUpdated } from "../mcp.notifications";
import type { ResolvedMcpConfiguration } from "../configuration/configuration.types";
import type { RunMcpServerStatus } from "../mcp.types";

/** @internal MCP connections and their configuration for one execution. */
export interface McpRunResources {
  readonly runId: string;
  readonly parentRunId?: string;
  readonly configuration: ResolvedMcpConfiguration;
  readonly manager: McpConnectionManager;
  readonly statuses: readonly RunMcpServerStatus[];
  disposal?: Promise<void>;
}

/** @internal MCP resources, current notifications, and serialized configuration work. */
export interface McpContext {
  readonly runs: RunsPlugin;
  readonly repository: RunRepository;
  readonly notifications: PluginNotifications<McpNotifications>;
  readonly resources: Map<string, McpRunResources>;
  readonly snapshots: Map<string, McpServersUpdated>;
  readonly preparations: Set<Promise<RunPreparationResult>>;
  configurationWork: Promise<void>;
  disposed: boolean;
}
