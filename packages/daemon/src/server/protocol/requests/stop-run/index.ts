import type { HandlerContext } from "../../dispatcher/dispatcher.types";
import type { StopRunMessage } from "./stop-run.schema";

export { StopRunMessage } from "./stop-run.schema";

export function handleStopRun(
  message: StopRunMessage,
  context: HandlerContext<"stop_run">,
): Promise<void> {
  return context.daemonRunState.stopRun(message.runId);
}
