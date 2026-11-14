import type { RunMcpServerStatus } from "./mcp.types";

/** Current selections and connection outcomes for one execution. */
export interface McpServersUpdated {
  /** Notification discriminator. */
  readonly type: "run_mcp_servers_updated";
  /** Execution whose MCP state changed. */
  readonly runId: string;
  /** Immediate parent execution, when applicable. */
  readonly parentRunId?: string;
  /** Display-safe server states. */
  readonly servers: readonly RunMcpServerStatus[];
  /** Time of the update. */
  readonly ts: string;
}

/** Declared MCP notifications, indexed by event discriminator. */
export type McpNotifications = {
  readonly run_mcp_servers_updated: McpServersUpdated;
};
