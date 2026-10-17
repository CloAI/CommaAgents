import { createPlugin } from "../../daemon-plugin";
import { createQuestionsContext, getPendingQuestions } from "./state";
import { resolveQuestion } from "./requests";
import { prepareQuestionRunResources, disposeQuestions } from "./run-resources";
import type { QuestionsContext } from "./state/state.types";
import type { QuestionsNotifications } from "./questions.notifications";
import type {
  CreateQuestionsPluginOptions,
  QuestionsPlugin,
} from "./questions.types";

/**
 * Register tool question handling for root and child executions.
 * @param {CreateQuestionsPluginOptions} options - Runs plugin dependency.
 * @returns {QuestionsPlugin} Question subscriptions, pending requests, and response controls.
 * @example
 * ```ts
 * const questions = createQuestionsPlugin({ dependencies: { runs } });
 * await questions.notifications.subscribe("run_question_requested", runId, (request) => {
 *   questions.resolveQuestion(request.runId, request.requestId, "Use the existing configuration.");
 * });
 * ```
 */
export function createQuestionsPlugin({
  dependencies,
}: CreateQuestionsPluginOptions): QuestionsPlugin {
  const { plugin, notifications } = createPlugin<
    "questions",
    QuestionsNotifications
  >({
    name: "questions",
    notifications: true,
    cleanup: async () => disposeQuestions(context),
    notificationHooks: {
      getRecipientKeys: (runId) =>
        dependencies.runs
          .getRunLineage(runId)
          .map((identity) => identity.runId),
      onSubscribe: (_type, runId, deliver) => {
        for (const request of getPendingQuestions(context, runId)) {
          if (context.pending.has(request.requestId)) {
            deliver(request);
          }
        }
      },
    },
  });
  const context: QuestionsContext = createQuestionsContext(
    dependencies.runs,
    notifications,
  );
  dependencies.runs.registerRunPreparation({
    name: "questions",
    prepare: (preparation) => prepareQuestionRunResources(context, preparation),
  });
  return {
    ...plugin,
    resolveQuestion: (runId, requestId, response) =>
      resolveQuestion(context, runId, requestId, response),
    getPendingQuestions: (runId) => getPendingQuestions(context, runId),
  };
}
