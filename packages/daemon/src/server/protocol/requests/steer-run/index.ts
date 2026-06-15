// Steer-run request handler.
// Queues a steering message that the run system injects into the running
// strategy before its next agent turn.

import type { HandlerContext } from "../../dispatcher.types";
import { RUN_NOT_STEERABLE } from "./steer-run.constants";
import type { SteerRunMessage } from "./steer-run.schema";

export { SteerRunMessage } from "./steer-run.schema";

/**
 * Handle a `steer_run` request by queueing the text on the run's steering
 * mailbox. The text is merged into the next agent call by the run system.
 *
 * If the run is not found or has already finished, sends a
 * `RUN_NOT_STEERABLE` error back to the client.
 */
export function handleSteerRun(
  message: SteerRunMessage,
  context: HandlerContext<"steer_run">,
): void {
  const queued = context.runSystem.actions.invoke(
    "steer",
    message.runId,
    message.text,
  );
  if (!queued) {
    context.reply({
      type: "error" as const,
      code: RUN_NOT_STEERABLE,
      message: `Cannot steer run ${message.runId}: not running`,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  }
}
