import type { RunPreparationContext, RunPreparationResult } from "../../runs";
import type { QuestionsContext } from "../state/state.types";
import type { QuestionRunResources } from "./run-resources.types";
import { cleanupRunQuestions, requestQuestion } from "../requests";

/**
 * Release one execution's question resources exactly once.
 * @param {QuestionsContext} context - Private feature resources.
 * @param {QuestionRunResources} runResources - Question resources belonging to one execution.
 * @returns {void} Nothing; releases resources and rejects unanswered questions.
 * @internal
 */
export function disposeQuestionRunResources(
  context: QuestionsContext,
  runResources: QuestionRunResources,
): void {
  if (runResources.disposed) {
    return;
  }

  runResources.disposed = true;
  runResources.detachAbort();
  cleanupRunQuestions(context, runResources);
  context.runResources.delete(runResources.runId);
}

/**
 * Supply a question requester for one root or child execution.
 * @param {QuestionsContext} context - Private feature resources.
 * @param {RunPreparationContext} preparation - Execution identity and cancellation.
 * @returns {RunPreparationResult} Question requester and cleanup for this execution.
 * @internal
 */
export function prepareQuestionRunResources(
  context: QuestionsContext,
  preparation: RunPreparationContext,
): RunPreparationResult {
  if (context.disposed) {
    throw new Error("Questions plugin has been disposed");
  }

  if (preparation.signal.aborted) {
    throw new DOMException("Run aborted", "AbortError");
  }

  if (context.runResources.has(preparation.runId)) {
    throw new Error(
      `Question resources already prepared for run: ${preparation.runId}`,
    );
  }

  const onAbort = (): void => {
    disposeQuestionRunResources(context, runResources);
  };
  const runResources: QuestionRunResources = {
    runId: preparation.runId,
    ...(preparation.parentRunId
      ? { parentRunId: preparation.parentRunId }
      : {}),
    signal: preparation.signal,
    onAbort,
    detachAbort: () => preparation.signal.removeEventListener("abort", onAbort),
    disposed: false,
  };
  context.runResources.set(runResources.runId, runResources);
  runResources.signal.addEventListener("abort", runResources.onAbort, {
    once: true,
  });
  return {
    strategyInputs: {
      questionRequester: (request) =>
        requestQuestion(context, runResources, request),
    },
    dispose: () => disposeQuestionRunResources(context, runResources),
  };
}

/**
 * Release question resources for all executions when the plugin ends.
 * @param {QuestionsContext} context - Private feature resources.
 * @returns {void} Nothing; prevents future preparation and rejects pending questions.
 * @internal
 */
export function disposeQuestions(context: QuestionsContext): void {
  context.disposed = true;
  for (const runResources of context.runResources.values()) {
    disposeQuestionRunResources(context, runResources);
  }
}
