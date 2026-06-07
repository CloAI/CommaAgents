// Continue-run request handler.
// Restarts the referenced run's strategy with cumulative conversation context.

import type { HandlerContext } from "../../dispatcher.types";
import type { ContinueRunMessage } from "./continue-run.schema";

export { ContinueRunMessage } from "./continue-run.schema";

export function handleContinueRun(
  message: ContinueRunMessage,
  context: HandlerContext<"continue_run">,
): void {
  context.executor
    .continueRun(
      context.clientId,
      message.runId,
      message.input,
      message.strategyPath,
      message.manifestPath,
      message.requestId,
    )
    .catch((error) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      context.logger.warn(
        `Cannot continue run ${message.runId}: ${errorMessage}`,
      );
      context.reply({
        type: "error" as const,
        code: "RUN_NOT_CONTINUABLE",
        message: errorMessage,
        ts: new Date().toISOString(),
        ...(message.requestId !== undefined
          ? { requestId: message.requestId }
          : {}),
      });
    });
}
