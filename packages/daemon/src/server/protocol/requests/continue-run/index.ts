import type { HandlerContext } from "../../dispatcher.types";
import type { ContinueRunMessage } from "./continue-run.schema";

export { ContinueRunMessage } from "./continue-run.schema";

export function handleContinueRun(
  message: ContinueRunMessage,
  context: HandlerContext<"continue_run">,
): void {
  try {
    context.runSystem.continueRun(
      context.clientId,
      message.runId,
      message.input,
      message.requestId,
    );
  } catch (error) {
    context.reply({
      type: "error",
      code: "CONTINUE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  }
}
