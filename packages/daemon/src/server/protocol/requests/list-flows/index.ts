// List-flows request handler.
// Returns a summary of all known runs.

import type { RunState } from "../../../../state/state.types";
import type { HandlerContext } from "../../dispatcher.types";
import type { RunSummary } from "../../responses/flow-list/flow-list.schema";
import type { ListFlowsMessage } from "./list-flows.schema";

export { ListFlowsMessage } from "./list-flows.schema";

/** Convert a RunState into a wire-safe RunSummary. */
function toRunSummary(run: RunState): RunSummary {
  return {
    runId: run.id,
    strategyName: run.strategyName,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    ...(run.completedAt ? { completedAt: run.completedAt.toISOString() } : {}),
  };
}

/**
 * Handle a `list_flows` request by returning all known runs as summaries.
 */
export function handleListFlows(
  message: ListFlowsMessage,
  context: HandlerContext<"list_flows">,
): void {
  const runs = context.state.listRuns();
  const summaries = runs.map(toRunSummary);
  context.reply({
    type: "flow_list" as const,
    runs: summaries,
    ts: new Date().toISOString(),
    ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
  });
}
