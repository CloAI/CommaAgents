import { describe, expect, it, vi } from "vitest";
import type { QuestionRequested } from "@comma-agents/daemon";

const fixtures = vi.hoisted(() => {
  let receiveQuestion: ((request: QuestionRequested) => void) | undefined;
  const submitAnswers = vi.fn();
  const request: QuestionRequested = {
    type: "run_question_requested",
    runId: "root",
    requestId: "request",
    agentName: "Planner",
    toolName: "ask_questions",
    ts: "2026-11-12T12:00:00Z",
    questions: [
      {
        id: "scope",
        prompt: "Choose scope",
        fields: [
          {
            id: "text",
            type: "text",
            label: "Scope",
            required: true,
            recommendation: {
              value: "Accept my suggestion",
              explanation: "Suggested",
            },
          },
        ],
      },
      {
        id: "timing",
        prompt: "When?",
        fields: [{ id: "text", type: "text", label: "Timing", required: true }],
      },
    ],
  };
  const kernel = {
    plugins: {
      runs: {
        prepareRun: async () => ({ runId: "root" }),
        notifications: { subscribe: async () => () => {} },
        startRun: () => ({
          completion: Promise.resolve().then(() => {
            receiveQuestion?.(request);
            return { status: "completed" };
          }),
        }),
      },
      questions: {
        notifications: {
          subscribe: async (
            _type: string,
            _runId: string,
            receive: (request: QuestionRequested) => void,
          ) => {
            receiveQuestion = receive;
            return () => {};
          },
        },
        submitAnswers,
      },
      sandbox: { notifications: { subscribe: async () => () => {} } },
    },
    dispose: async () => {},
  };
  return { kernel, submitAnswers };
});

vi.mock("@comma-agents/daemon", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@comma-agents/daemon")>()),
  createDaemonKernel: async () => fixtures.kernel,
  loadDaemonConfig: () => ({
    runsDir: "/tmp/questions-headless",
    instructionFiles: [],
    modelRoles: {},
  }),
}));
vi.mock("@comma-agents/core/strategy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@comma-agents/core/strategy")>()),
  discoverStrategies: async () => ({
    strategies: [
      { name: "Plan", label: "Plan", path: "/strategies/plan.json" },
    ],
  }),
}));

import { runHeadless } from "./run";

describe("headless questionnaires", () => {
  it("should submit one complete skipped response without accepting recommendations", async () => {
    const result = await runHeadless({
      strategy: "Plan",
      input: "Review",
      cwd: "/work",
    });
    expect(fixtures.submitAnswers).toHaveBeenCalledTimes(1);
    expect(fixtures.submitAnswers).toHaveBeenCalledWith(
      "root",
      "request",
      expect.any(String),
      {
        answers: [
          { questionId: "scope", type: "skipped" },
          { questionId: "timing", type: "skipped" },
        ],
      },
    );
    expect(result.status).toBe("completed");
  });
});
