/** A tool-originated question awaiting a user response. */
export interface QuestionRequested {
  /** Notification discriminator. */
  readonly type: "run_question_requested";
  /** Identifier of the requesting execution. */
  readonly runId: string;
  /** Immediate parent execution, when applicable. */
  readonly parentRunId?: string;
  /** Unique identifier used to answer this question. */
  readonly requestId: string;
  /** Agent asking the question. */
  readonly agentName: string;
  /** Tool asking the question. */
  readonly toolName: string;
  /** Question presented to the user. */
  readonly question: string;
  /** Time at which the question was requested. */
  readonly ts: string;
}

/** Declared question notifications, indexed by event discriminator. */
export type QuestionsNotifications = {
  readonly run_question_requested: QuestionRequested;
};
