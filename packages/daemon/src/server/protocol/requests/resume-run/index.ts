// Resume-run request handler.
// Delegating to the executor to resume an existing run.

import type { HandlerContext } from "../../dispatcher.types";
import type { ResumeRunMessage } from "./resume-run.schema";

export { ResumeRunMessage } from "./resume-run.schema";

/**
 * Handle a `resume_run` request by delegating to the executor.
 *
 * No immediate response is sent — the executor re-broadcasts
 * `strategy_started` with the resumed state and continues.
 */
export function handleResumeRun(
  message: ResumeRunMessage,
  context: HandlerContext<"resume_run">,
): void {
  context.executor.resumeRun(
    context.clientId,
    message.runId,
    message.requestId,
    message.modelOverride,
  );
}
