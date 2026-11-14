import type { QuestionsResponse } from "@comma-agents/core";
import type { NotifyingPlugin } from "../../daemon-plugin";
import type { RunsPlugin } from "../runs";
import type {
  QuestionRequested,
  QuestionsNotifications,
} from "./questions.notifications";

/** Dependencies used to register tool question handling with runs. */
export interface CreateQuestionsPluginOptions {
  /** Feature services supplied by the daemon. */
  readonly dependencies: {
    /** Run preparation and execution ancestry APIs. */
    readonly runs: RunsPlugin;
  };
}

/** User questions and responses for root and child executions. */
export interface QuestionsPlugin extends NotifyingPlugin<
  "questions",
  QuestionsNotifications
> {
  /** Atomically complete one questionnaire, replaying an identical successful submission safely. */
  submitAnswers(
    runId: string,
    requestId: string,
    submissionId: string,
    response: QuestionsResponse,
  ): QuestionsSubmissionResult;
  /** Read unresolved questions for this execution and its descendants. */
  getPendingQuestions(runId: string): readonly QuestionRequested[];
}

/** Receipt for an accepted complete questionnaire response. */
export interface QuestionsSubmissionResult {
  /** The complete response has been accepted. */
  readonly accepted: true;
  /** Whether this repeats the same successful submission. */
  readonly replayed: boolean;
}
