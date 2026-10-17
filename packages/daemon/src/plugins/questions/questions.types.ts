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
  /** Answer a question belonging to this execution. Returns false for stale or mismatched requests. */
  resolveQuestion(runId: string, requestId: string, response: string): boolean;
  /** Read unresolved questions for this execution and its descendants. */
  getPendingQuestions(runId: string): readonly QuestionRequested[];
}
