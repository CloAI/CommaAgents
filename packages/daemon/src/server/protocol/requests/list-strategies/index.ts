// List-strategies request handler.
// Returns a summary of all known runs.

import type { RunState } from "../../../../state/state.types";
import type { HandlerContext } from "../../dispatcher.types";
import type { RunSummary } from "../../responses/strategy-list/strategy-list.schema";
import type { ListStrategiesMessage } from "./list-strategies.schema";

export { ListStrategiesMessage } from "./list-strategies.schema";

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
 * Handle a `list_strategies` request by returning all known runs as summaries.
 */
export function handleListStrategies(
  message: ListStrategiesMessage,
  context: HandlerContext<"list_strategies">,
): void {
  const runs = context.state.listRuns();
  const summaries = runs.map(toRunSummary);
  context.reply({
    type: "strategy_list" as const,
    runs: summaries,
    ts: new Date().toISOString(),
    ...(message.requestId !== undefined
      ? { requestId: message.requestId }
      : {}),
  });
}
