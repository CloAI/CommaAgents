import type { QuestionsResponse } from "@comma-agents/core";
import type { PluginNotifications } from "../../../daemon-plugin";
import type { RunsPlugin } from "../../runs";
import type { QuestionRunResources } from "../run-resources/run-resources.types";
import type {
  QuestionRequested,
  QuestionsNotifications,
} from "../questions.notifications";

/** @internal Pending response and its cancellation resources. */
export interface PendingQuestion {
  readonly runResources: QuestionRunResources;
  readonly request: QuestionRequested;
  readonly resolve: (response: QuestionsResponse) => void;
  readonly reject: (reason: unknown) => void;
  readonly detachAbort: () => void;
}

/** @internal State owned exclusively by the questions plugin. */
export interface QuestionsContext {
  readonly runs: Pick<RunsPlugin, "getRunLineage">;
  readonly notifications: PluginNotifications<QuestionsNotifications>;
  readonly runResources: Map<string, QuestionRunResources>;
  readonly pending: Map<string, PendingQuestion>;
  readonly receipts: Map<string, SubmissionReceipt>;
  disposed: boolean;
}

/** @internal Successful submission retained for retries during this execution. */
export interface SubmissionReceipt {
  readonly runResources: QuestionRunResources;
  readonly submissionId: string;
  readonly response: QuestionsResponse;
}
