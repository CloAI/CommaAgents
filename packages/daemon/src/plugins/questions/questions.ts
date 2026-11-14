import { createPlugin } from "../../daemon-plugin";
import type { CreateNotifyingPluginOptions } from "../../daemon-plugin/notifications/notifications.types";
import { submitAnswersCommand, watchQuestionsChannel } from "./server";
import { createQuestionsContext, getPendingQuestions } from "./state";
import { submitAnswers } from "./requests";
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
 *   questions.submitAnswers(request.runId, request.requestId, crypto.randomUUID(), { answers: request.questions.map((question) => ({ questionId: question.id, type: "skipped" })) });
 * });
 * ```
 */
export function createQuestionsPlugin({
  dependencies,
}: CreateQuestionsPluginOptions) {
  const { plugin, notifications } = createPlugin({
    name: "questions",
    notifications: true,
    server: {
      commands: [submitAnswersCommand],
      channels: [watchQuestionsChannel],
    },
    cleanup: async () => disposeQuestions(context),
    notificationHooks: {
      getRecipientKeys: (runId) =>
        dependencies.runs
          .getRunLineage(runId)
          .map((identity) => identity.runId),
      onSubscribe: (type, runId, deliver) => {
        if (type !== "run_question_requested") {
          return;
        }
        for (const request of getPendingQuestions(context, runId)) {
          if (context.pending.has(request.requestId)) {
            deliver(request);
          }
        }
      },
    },
  } satisfies CreateNotifyingPluginOptions<
    "questions",
    QuestionsNotifications,
    QuestionsPlugin
  >);
  const context: QuestionsContext = createQuestionsContext(
    dependencies.runs,
    notifications,
  );
  dependencies.runs.registerRunPreparation({
    name: "questions",
    prepare: (preparation) => prepareQuestionRunResources(context, preparation),
  });
  const methods: Omit<QuestionsPlugin, keyof typeof plugin> = {
    submitAnswers: (runId, requestId, submissionId, response) =>
      submitAnswers(context, runId, requestId, submissionId, response),
    getPendingQuestions: (runId) => getPendingQuestions(context, runId),
  };
  return Object.assign(plugin, methods);
}
