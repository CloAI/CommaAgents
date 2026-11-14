import { useReducer } from "react";
import { useDaemonChannel } from "../useDaemonChannel";
import type { PendingQuestion } from "./usePendingQuestions.types";
import { reducePendingQuestions } from "./usePendingQuestions.utils";

const NO_QUESTIONS: readonly PendingQuestion[] = [];

/**
 * Follow the questions that a run's agents and subagents are waiting on.
 * @param {string} runId - Root run whose questions to follow.
 * @returns {readonly PendingQuestion[]} Questions awaiting an answer, oldest first.
 * @example
 * const questions = usePendingQuestions(runId);
 */
export function usePendingQuestions(runId: string): readonly PendingQuestion[] {
  const [questions, dispatch] = useReducer(
    reducePendingQuestions,
    NO_QUESTIONS,
  );
  useDaemonChannel("questions.watch", { runId }, dispatch);
  return questions;
}
