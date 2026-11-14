import type { DaemonChannelMap } from "@comma-agents/daemon/protocol";

/** One event on a run's questions channel. */
export type QuestionChannelMessage =
  DaemonChannelMap["questions.watch"]["message"];

/** A tool question from the run or one of its subagents, waiting for an answer. */
export type PendingQuestion = Extract<
  QuestionChannelMessage,
  { type: "question.requested" }
>["data"];
