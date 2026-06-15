import type { HandlerContext } from "../../dispatcher.types";
import type { StopRunMessage } from "./stop-run.schema";

export { StopRunMessage } from "./stop-run.schema";

export function handleStopRun(
  message: StopRunMessage,
  context: HandlerContext<"stop_run">,
): void {
  context.runSystem.stopRun(message.runId);
}
