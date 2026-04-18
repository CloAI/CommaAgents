// Start-strategy request handler.
// Starts a strategy execution via the executor.

import type { HandlerContext } from "../../dispatcher.types";
import type { StartStrategyMessage } from "./start-strategy.schema";

export { StartStrategyMessage } from "./start-strategy.schema";

/**
 * Handle a `start_strategy` request by delegating to the executor.
 *
 * No immediate response is sent — the executor broadcasts
 * `strategy_started` via the event sink once execution begins.
 */
export function handleStartStrategy(
  message: StartStrategyMessage,
  context: HandlerContext<"start_strategy">,
): void {
  context.executor.startRun(
    context.clientId,
    message.strategyPath,
    message.input,
    message.requestId,
    message.modelOverride,
  );
}
