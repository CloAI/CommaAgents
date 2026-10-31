import { describe, expect, it } from "vitest";
import type { PendingQuestion } from "./usePendingQuestions.types";
import { reducePendingQuestions } from "./usePendingQuestions.utils";

const question: PendingQuestion = {
  runId: "run-1",
  requestId: "q-1",
  agentName: "planner",
  toolName: "request_strategy_switch",
  question: "Switch this conversation to Build? Plan approved. (yes/no)",
  ts: "2026-10-26T12:00:00.000Z",
};

describe("reducePendingQuestions", () => {
  it("should add a requested question once, even when it is redelivered", () => {
    const once = reducePendingQuestions([], {
      type: "question.requested",
      data: question,
    });
    const twice = reducePendingQuestions(once, {
      type: "question.requested",
      data: question,
    });
    expect(twice).toEqual([question]);
  });

  it("should remove a question when it is resolved", () => {
    expect(
      reducePendingQuestions([question], {
        type: "question.resolved",
        data: { runId: "run-1", requestId: "q-1" },
      }),
    ).toEqual([]);
  });
});
