import type { HandlerContext } from "../../dispatcher.types";
import type { StartRunMessage } from "./start-run.schema";

export { StartRunMessage } from "./start-run.schema";

export function handleStartRun(
  message: StartRunMessage,
  context: HandlerContext<"start_run">,
): void {
  try {
    context.runSystem.startRun(
      context.clientId,
      message.runId,
      message.input,
      message.requestId,
    );
  } catch (error) {
    context.reply({
      type: "error",
      code: "START_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  }
}
