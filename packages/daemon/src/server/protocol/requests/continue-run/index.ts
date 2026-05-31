// Continue-run request handler.
// Delegates to the executor to continue a finished run with a new prompt.

import type { HandlerContext } from "../../dispatcher.types";
import type { ContinueRunMessage } from "./continue-run.schema";

export { ContinueRunMessage } from "./continue-run.schema";

/**
 * Handle a `continue_run` request by delegating to the executor.
 *
 * No immediate response is sent — the executor re-broadcasts
 * `strategy_started` for the continued run and streams events as usual.
 */
export function handleContinueRun(
  message: ContinueRunMessage,
  context: HandlerContext<"continue_run">,
): void {
  context.executor.continueRun(
    context.clientId,
    message.runId,
    message.input,
    message.strategyPath,
    message.requestId,
    message.modelOverride,
  );
}
