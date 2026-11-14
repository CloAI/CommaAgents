import { isDeepStrictEqual } from "node:util";
import {
  QuestionsSchema,
  QuestionsResponseSchema,
  validateQuestionsResponse,
} from "@comma-agents/core";
import type { QuestionsRequest, QuestionsResponse } from "@comma-agents/core";
import type { QuestionsSubmissionResult } from "../questions.types";
import type { PendingQuestion, QuestionsContext } from "../state/state.types";
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
  context.notifications.notify(pending.request.runId, {
    type: "run_question_resolved",
    runId: pending.request.runId,
    requestId,
  });
  return pending;
}

/**
 * Request a response while observing execution and tool cancellation.
 * @param {QuestionsContext} context - Private feature resources.
 * @param {QuestionRunResources} runResources - Resources belonging to the execution asking the question.
 * @param {QuestionsRequest} request - Tool question and cancellation signal.
 * @returns {Promise<QuestionsResponse>} User response or cancellation rejection.
 * @internal
 */
export function requestQuestions(
  context: QuestionsContext,
  runResources: QuestionRunResources,
  request: QuestionsRequest,
): Promise<QuestionsResponse> {
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
  const questionnaire = QuestionsSchema.parse({ questions: request.questions });
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
    questions: questionnaire.questions,
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
      request: structuredClone(notification),
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
 * Validate and atomically resolve a complete questionnaire, or replay its receipt.
 * @param {QuestionsContext} context - Private feature resources.
 * @param {string} runId - Execution that owns the request.
 * @param {string} requestId - Pending questionnaire ID.
 * @param {string} submissionId - Stable client ID reused for an identical retry.
 * @param {QuestionsResponse} response - All answers, overrides, and skips.
 * @returns {QuestionsSubmissionResult} Successful submission receipt.
 * @internal
 */
export function submitAnswers(
  context: QuestionsContext,
  runId: string,
  requestId: string,
  submissionId: string,
  response: QuestionsResponse,
): QuestionsSubmissionResult {
  const parsed = QuestionsResponseSchema.safeParse(response);
  if (!parsed.success || !submissionId) {
    throw Object.assign(new Error("Invalid questionnaire response"), {
      code: "INVALID_ANSWERS",
      metadata: {
        issues: parsed.success
          ? []
          : parsed.error.issues.map((issue) => ({
              message: issue.message,
              path: issue.path,
            })),
      },
    });
  }
  const receipt = context.receipts.get(requestId);
  if (receipt?.runResources.runId === runId) {
    if (
      receipt.submissionId === submissionId &&
      isDeepStrictEqual(receipt.response, parsed.data)
    ) {
      return { accepted: true, replayed: true };
    }
    throw Object.assign(
      new Error("This questionnaire has already been submitted."),
      { code: "SUBMISSION_CONFLICT" },
    );
  }
  const pending = context.pending.get(requestId);
  if (!pending || pending.request.runId !== runId) {
    throw Object.assign(
      new Error("This questionnaire is no longer pending for this execution."),
      { code: "QUESTION_NOT_PENDING" },
    );
  }
  const issues = validateQuestionsResponse(
    { questions: pending.request.questions },
    parsed.data,
  );
  if (issues.length > 0) {
    throw Object.assign(
      new Error("Complete or correct the highlighted answers."),
      { code: "INVALID_ANSWERS", metadata: { issues } },
    );
  }
  context.receipts.set(requestId, {
    runResources: pending.runResources,
    submissionId,
    response: structuredClone(parsed.data),
  });
  removeQuestion(context, requestId);
  pending.resolve(parsed.data);
  return { accepted: true, replayed: false };
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
  for (const [requestId, receipt] of context.receipts) {
    if (receipt.runResources === runResources) {
      context.receipts.delete(requestId);
    }
  }
  for (const [requestId, pending] of context.pending) {
    if (pending.runResources === runResources) {
      removeQuestion(context, requestId)?.reject(
        new DOMException("Question run resources cleaned up", "AbortError"),
      );
    }
  }
}
