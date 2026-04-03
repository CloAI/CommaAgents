// Stop-flow request handler.
// Cancels a running flow via the executor.

import type { HandlerContext } from "../../dispatcher.types";
import type { StopFlowMessage } from "./stop-flow.schema";

export { StopFlowMessage } from "./stop-flow.schema";

/**
 * Handle a `stop_flow` request by cancelling the run.
 */
export function handleStopFlow(
  message: StopFlowMessage,
  context: HandlerContext<"stop_flow">,
): void {
  context.executor.stopRun(message.runId);
}
