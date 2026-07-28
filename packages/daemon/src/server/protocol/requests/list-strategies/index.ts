// List-strategies request handler.
// Returns a summary of all known runs.

import type { RunSnapshot } from "../../../../daemon-store/daemon-store.types";
import type { HandlerContext } from "../../dispatcher/dispatcher.types";
import type { RunSummary } from "../../responses/strategy-list/strategy-list.schema";
import type { ListStrategiesMessage } from "./list-strategies.schema";

export { ListStrategiesMessage } from "./list-strategies.schema";

/** Convert a RunSnapshot into a wire-safe RunSummary. */
function toRunSummary(run: RunSnapshot): RunSummary {
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
  const runs = context.daemonStore.listRuns();
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
