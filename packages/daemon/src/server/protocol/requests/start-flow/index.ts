// Start-flow request handler.
// Starts a strategy execution via the executor.

import type { HandlerContext } from "../../dispatcher.types";
import type { StartFlowMessage } from "./start-flow.schema";

export { StartFlowMessage } from "./start-flow.schema";

/**
 * Handle a `start_flow` request by delegating to the executor.
 *
 * No immediate response is sent — the executor broadcasts
 * `flow_started` via the event sink once execution begins.
 */
export function handleStartFlow(
  message: StartFlowMessage,
  context: HandlerContext<"start_flow">,
): void {
  context.executor.startRun(
    context.clientId,
    message.strategyPath,
    message.input,
    message.requestId,
  );
}
