import type { Question } from "@comma-agents/core";
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
  readonly questions: readonly Question[];
  /** Time at which the question was requested. */
  readonly ts: string;
}

/** A question that no longer awaits a response: answered, cancelled, or released with its run. */
export interface QuestionResolved {
  /** Notification discriminator. */
  readonly type: "run_question_resolved";
  /** Identifier of the requesting execution. */
  readonly runId: string;
  /** Identifier of the question that ended. */
  readonly requestId: string;
}

/** Declared question notifications, indexed by event discriminator. */
export type QuestionsNotifications = {
  readonly run_question_requested: QuestionRequested;
  readonly run_question_resolved: QuestionResolved;
};
