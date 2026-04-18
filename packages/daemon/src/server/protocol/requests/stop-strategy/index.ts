// Stop-strategy request handler.
// Cancels a running strategy via the executor.

import type { HandlerContext } from "../../dispatcher.types";
import type { StopStrategyMessage } from "./stop-strategy.schema";

export { StopStrategyMessage } from "./stop-strategy.schema";

/**
 * Handle a `stop_strategy` request by cancelling the run.
 */
export function handleStopStrategy(
  message: StopStrategyMessage,
  context: HandlerContext<"stop_strategy">,
): void {
  context.executor.stopRun(message.runId);
}
