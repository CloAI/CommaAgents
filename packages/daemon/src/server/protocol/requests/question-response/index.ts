// Question-response request handler.
// Routes a user feedback response to the pending question request on a running strategy.

import type { HandlerContext } from "../../dispatcher.types";
import type { QuestionResponseMessage } from "./question-response.schema";

export { QuestionResponseMessage } from "./question-response.schema";

/**
 * Handle a `question_response` request by resolving the pending question.
 *
 * If no pending question request exists for the specified `questionRequestId`,
 * sends a `NO_PENDING_QUESTION` error back to the client.
 */
export function handleQuestionResponse(
  message: QuestionResponseMessage,
  context: HandlerContext<"question_response">,
): void {
  const delivered = context.runSystem.actions.invoke(
    "resolveQuestion",
    message.runId,
    message.questionRequestId,
    message.response,
  );
  if (!delivered) {
    context.reply({
      type: "error" as const,
      code: "NO_PENDING_QUESTION",
      message: `No pending question request ${message.questionRequestId} for run ${message.runId}`,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  }
}
