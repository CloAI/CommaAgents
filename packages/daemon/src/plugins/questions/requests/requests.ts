import type {
  PendingQuestion,
  QuestionRequest,
  QuestionsContext,
} from "../state/state.types";
import type { QuestionRunResources } from "../run-resources/run-resources.types";
import type { QuestionRequested } from "../questions.notifications";

function removeQuestion(
  context: QuestionsContext,
  requestId: string,
): PendingQuestion | undefined {
  const pending = context.pending.get(requestId);
  if (!pending) {
    return undefined;
  }
  context.pending.delete(requestId);
  pending.detachAbort();
  return pending;
}

/**
 * Request a response while observing execution and tool cancellation.
 * @param {QuestionsContext} context - Private feature resources.
 * @param {QuestionRunResources} runResources - Resources belonging to the execution asking the question.
 * @param {QuestionRequest} request - Tool question and cancellation signal.
 * @returns {Promise<string>} User response or cancellation rejection.
 * @internal
 */
export function requestQuestion(
  context: QuestionsContext,
  runResources: QuestionRunResources,
  request: QuestionRequest,
): Promise<string> {
  if (
    context.disposed ||
    runResources.disposed ||
    runResources.signal.aborted ||
    request.signal?.aborted
  ) {
    return Promise.reject(
      new DOMException("Question request stopped", "AbortError"),
    );
  }
  const requestId = crypto.randomUUID();
  const notification: QuestionRequested = {
    type: "run_question_requested",
    runId: runResources.runId,
    ...(runResources.parentRunId
      ? { parentRunId: runResources.parentRunId }
      : {}),
    requestId,
    agentName: request.agentName,
    toolName: request.toolName,
    question: request.question,
    ts: new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const toolSignal =
      request.signal !== runResources.signal ? request.signal : undefined;
    const onAbort = (): void => {
      removeQuestion(context, requestId)?.reject(
        new DOMException("Question request stopped", "AbortError"),
      );
    };
    const detachAbort = (): void => {
      runResources.signal.removeEventListener("abort", onAbort);
      toolSignal?.removeEventListener("abort", onAbort);
    };
    context.pending.set(requestId, {
      runResources,
      request: notification,
      resolve,
      reject,
      detachAbort,
    });
    runResources.signal.addEventListener("abort", onAbort, { once: true });
    toolSignal?.addEventListener("abort", onAbort, { once: true });
    context.notifications.notify(runResources.runId, notification);
  });
}

/**
 * Resolve only a question belonging to the requesting execution.
 * @param {QuestionsContext} context - Private feature resources.
 * @param {string} runId - Identifier of the requesting execution.
 * @param {string} requestId - Pending question identifier.
 * @param {string} response - User response, including an empty response when intended.
 * @returns {boolean} Whether a matching question was answered.
 * @internal
 */
export function resolveQuestion(
  context: QuestionsContext,
  runId: string,
  requestId: string,
  response: string,
): boolean {
  if (context.pending.get(requestId)?.request.runId !== runId) {
    return false;
  }
  const pending = removeQuestion(context, requestId);
  if (!pending) {
    return false;
  }
  pending.resolve(response);
  return true;
}

/**
 * Reject unresolved questions when their execution releases its resources.
 * @param {QuestionsContext} context - Private feature resources.
 * @param {QuestionRunResources} runResources - Execution resources whose requests are released.
 * @returns {void} Nothing; rejects and removes pending questions.
 * @internal
 */
export function cleanupRunQuestions(
  context: QuestionsContext,
  runResources: QuestionRunResources,
): void {
  for (const [requestId, pending] of context.pending) {
    if (pending.runResources === runResources) {
      removeQuestion(context, requestId)?.reject(
        new DOMException("Question run resources cleaned up", "AbortError"),
      );
    }
  }
}
