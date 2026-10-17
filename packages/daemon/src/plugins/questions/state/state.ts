import type { PluginNotifications } from "../../../daemon-plugin";
import type { RunsPlugin } from "../../runs";
import type {
  QuestionRequested,
  QuestionsNotifications,
} from "../questions.notifications";
import type { QuestionsContext } from "./state.types";

/**
 * Allocate the questions plugin's private resources.
 * @param {RunsPlugin} runs - Execution ancestry service.
 * @param {PluginNotifications<QuestionsNotifications>} notifications - Private publishing controller.
 * @returns {QuestionsContext} Private execution resources and pending responses.
 * @internal
 */
export function createQuestionsContext(
  runs: RunsPlugin,
  notifications: PluginNotifications<QuestionsNotifications>,
): QuestionsContext {
  return {
    runs,
    notifications,
    runResources: new Map(),
    pending: new Map(),
    disposed: false,
  };
}

/**
 * Read pending questions for an execution and its descendants.
 * @param {QuestionsContext} context - Private feature resources.
 * @param {string} runId - Execution whose questions are requested.
 * @returns {readonly QuestionRequested[]} Unresolved questions.
 * @internal
 */
export function getPendingQuestions(
  context: QuestionsContext,
  runId: string,
): readonly QuestionRequested[] {
  return [...context.pending.values()]
    .filter((pending) =>
      context.runs
        .getRunLineage(pending.request.runId)
        .some((identity) => identity.runId === runId),
    )
    .map((pending) => pending.request);
}
