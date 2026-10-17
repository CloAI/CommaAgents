import type { McpServersUpdated } from "../mcp.notifications";
import type { RunMcpServerStatus } from "../mcp.types";
import type { McpContext } from "./state.types";

/**
 * Serialize selection reads and writes to avoid losing concurrent updates.
 * @param {McpContext} context - Private feature state.
 * @param {() => Promise<Result>} operation - Configuration operation to run.
 * @returns {Promise<Result>} Result of this operation.
 * @internal
 */
export function queueMcpConfiguration<Result>(
  context: McpContext,
  operation: () => Promise<Result>,
): Promise<Result> {
  const completion = context.configurationWork.then(operation);
  context.configurationWork = completion.then(
    () => undefined,
    () => undefined,
  );
  return completion;
}

/**
 * Retain display-safe execution state and optionally notify its ancestors.
 * @param {McpContext} context - Private feature state.
 * @param {string} runId - Execution producing the state.
 * @param {readonly RunMcpServerStatus[]} servers - Current server states.
 * @param {string} parentRunId - Optional immediate parent.
 * @param {boolean} notify - Whether listeners receive this update.
 * @returns {void} Nothing; retains and optionally publishes the snapshot.
 * @internal
 */
export function setMcpSnapshot(
  context: McpContext,
  runId: string,
  servers: readonly RunMcpServerStatus[],
  parentRunId?: string,
  notify = true,
): void {
  const snapshot: McpServersUpdated = {
    type: "run_mcp_servers_updated",
    runId,
    ...(parentRunId ? { parentRunId } : {}),
    servers,
    ts: new Date().toISOString(),
  };
  context.snapshots.set(runId, snapshot);
  if (notify) {
    context.notifications.notify(runId, snapshot);
  }
}
