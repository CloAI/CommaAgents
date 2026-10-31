import { RunOutcomeStatus } from "../runs/state/state.schemas";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { realpathSync } from "node:fs";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  repository,
} from "../runs/test.utils";
import { createQuestionsPlugin } from "./questions";
import type { QuestionRequested } from "./questions.notifications";
import type { QuestionRequester } from "./state/state.types";

afterEach(cleanupRunFixtures);

function fixture() {
  const requesters = new Map<string, QuestionRequester>();
  const loader = fakeLoader({ loads: [], restored: [] });
  const runs = createMockRunsPlugin({
    repository: repository(),
    async loadStrategy(options) {
      const requester = options.strategyInputs.questionRequester;
      if (!requester) {
        throw new Error("Question requester was not supplied");
      }
      requesters.set(options.runId, requester);
      return loader(options);
    },
  });
  const questions = createQuestionsPlugin({ dependencies: { runs } });
  return {
    runs,
    questions,
    requesters,
    cwd: realpathSync(directories.at(-1)!),
  };
}

const request = {
  agentName: "writer",
  toolName: "ask_question",
  question: "Which configuration should I use?",
};

describe("questions plugin", () => {
  test("should assign distinct IDs and answer only the matching execution's question", async () => {
    const { runs, questions, requesters, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    const notifications: QuestionRequested[] = [];
    await questions.notifications.subscribe(
      "run_question_requested",
      "root",
      (notification) => {
        notifications.push(notification);
      },
    );
    const first = requesters.get("root")!(request);
    const second = requesters.get("root")!(request);
    expect(notifications).toHaveLength(2);
    expect(
      new Set(notifications.map((notification) => notification.requestId)).size,
    ).toBe(2);
    expect(notifications[0]).toMatchObject({
      type: "run_question_requested",
      runId: "root",
      ...request,
    });
    expect(notifications[0]).not.toHaveProperty("signal");
    expect(
      questions.resolveQuestion(
        "wrong",
        notifications[0]!.requestId,
        "ignored",
      ),
    ).toBe(false);
    expect(
      questions.resolveQuestion(
        "root",
        notifications[0]!.requestId,
        "existing",
      ),
    ).toBe(true);
    expect(
      questions.resolveQuestion("root", notifications[1]!.requestId, ""),
    ).toBe(true);
    expect(await first).toBe("existing");
    expect(await second).toBe("");
    expect(
      questions.resolveQuestion("root", notifications[0]!.requestId, "again"),
    ).toBe(false);
    expect(questions.getPendingQuestions("root")).toEqual([]);
    await runs.dispose();
    await questions.dispose();
  });

  test("should replay outstanding questions and allow an immediate subscription response", async () => {
    const { runs, questions, requesters, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    const response = requesters.get("root")!(request);
    const pending = questions.getPendingQuestions("root");
    expect(pending).toHaveLength(1);
    const received: QuestionRequested[] = [];
    await questions.notifications.subscribe(
      "run_question_requested",
      "root",
      (notification) => {
        received.push(notification);
        questions.resolveQuestion(
          notification.runId,
          notification.requestId,
          "use defaults",
        );
      },
    );
    expect(pending).toEqual(received);
    expect(await response).toBe("use defaults");
    expect(questions.getPendingQuestions("root")).toEqual([]);
    await runs.dispose();
    await questions.dispose();
  });

  test("should honor tool cancellation and reject questions with a pre-aborted signal", async () => {
    const { runs, questions, requesters, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    const controller = new AbortController();
    const requester = requesters.get("root")!;
    const response = requester({ ...request, signal: controller.signal });
    const pending = questions.getPendingQuestions("root")[0]!;
    controller.abort();
    await expect(response).rejects.toThrow("stopped");
    expect(questions.getPendingQuestions("root")).toEqual([]);
    expect(questions.resolveQuestion("root", pending.requestId, "late")).toBe(
      false,
    );
    await expect(
      requester({ ...request, signal: controller.signal }),
    ).rejects.toThrow("stopped");
    const next = requester(request);
    questions.resolveQuestion(
      "root",
      questions.getPendingQuestions("root")[0]!.requestId,
      "still active",
    );
    expect(await next).toBe("still active");
    await runs.dispose();
    await questions.dispose();
  });

  test("should reject pending and future questions when a prepared run stops", async () => {
    const { runs, questions, requesters, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    const requester = requesters.get("root")!;
    const response = requester(request);
    await runs.stopRun("root");
    await expect(response).rejects.toThrow();
    await expect(requester(request)).rejects.toThrow("stopped");
    expect(questions.getPendingQuestions("root")).toEqual([]);
    await questions.dispose();
  });

  test("should replace run question resources on continuation and clean up on failed preparation", async () => {
    const { runs, questions, requesters, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    const previous = requesters.get("root")!;
    await runs.startRun("root", "first").completion;
    await expect(previous(request)).rejects.toThrow("stopped");
    await runs.prepareRun({ runId: "root" });
    const current = requesters.get("root")!;
    expect(current).not.toBe(previous);
    const response = current(request);
    questions.resolveQuestion(
      "root",
      questions.getPendingQuestions("root")[0]!.requestId,
      "continue",
    );
    expect(await response).toBe("continue");
    await runs.stopRun("root");
    runs.registerRunPreparation({
      name: "failure",
      prepare() {
        throw new Error("provider failed");
      },
    });
    await expect(
      runs.prepareRun({
        runId: "failed",
        configuration: {
          strategyPath: "example.json",
          cwd,
        },
      }),
    ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
    await expect(
      runs.prepareRun({
        runId: "failed",
        configuration: {
          strategyPath: "example.json",
          cwd,
        },
      }),
    ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
    await runs.dispose();
    await questions.dispose();
  });

  test("should route nested questions to ancestors and resolve by the requesting execution", async () => {
    const { runs, questions, requesters, cwd } = fixture();
    let grandchildId = "";
    let parentId = "";
    runs.registerStrategyHooks({
      name: "grandchild-question",
      attach(strategyContext) {
        if (runs.getRunLineage(strategyContext.runId).length !== 3) {
          return;
        }
        grandchildId = strategyContext.runId;
        parentId = strategyContext.parentRunId!;
        const call = strategyContext.strategy.flow.call;
        spyOn(strategyContext.strategy.flow, "call").mockImplementation(() => {
          let flowCall: ReturnType<typeof call> | undefined;
          const completion = requesters.get(strategyContext.runId)!({
            ...request,
            signal: strategyContext.signal,
          }).then((response) => {
            flowCall = call(response);
            return flowCall;
          });
          return Object.assign(completion, { abort: () => flowCall?.abort() });
        });
      },
    });
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    let receiveQuestion: (question: QuestionRequested) => void = () => {};
    const question = new Promise<QuestionRequested>((resolve) => {
      receiveQuestion = resolve;
    });
    await questions.notifications.subscribe(
      "run_question_requested",
      "root",
      receiveQuestion,
    );
    const completion = runs.startRun("root", "nested").completion;
    const notification = await question;
    expect(notification).toMatchObject({
      runId: grandchildId,
      parentRunId: parentId,
    });
    expect(questions.getPendingQuestions("root")).toEqual([notification]);
    expect(questions.getPendingQuestions(parentId)).toEqual([notification]);
    expect(questions.getPendingQuestions(grandchildId)).toEqual([notification]);
    const replayed: QuestionRequested[] = [];
    await questions.notifications.subscribe(
      "run_question_requested",
      parentId,
      (pending) => {
        replayed.push(pending);
      },
    );
    expect(replayed).toEqual([notification]);
    expect(
      questions.resolveQuestion("root", notification.requestId, "wrong"),
    ).toBe(false);
    questions.resolveQuestion(
      notification.runId,
      notification.requestId,
      "nested answer",
    );
    const outcome = await completion;
    expect(outcome.status).toBe(RunOutcomeStatus.completed);
    if (outcome.status === "completed") {
      expect(outcome.result.text).toBe("nested answer");
    }
    expect(questions.getPendingQuestions("root")).toEqual([]);
    await expect(requesters.get(grandchildId)!(request)).rejects.toThrow(
      "stopped",
    );
    await runs.dispose();
    await questions.dispose();
  });

  test("should cancel descendant questions when the root run stops", async () => {
    const { runs, questions, requesters, cwd } = fixture();
    runs.registerStrategyHooks({
      name: "child-question",
      attach(strategyContext) {
        if (!strategyContext.parentRunId) {
          return;
        }
        spyOn(strategyContext.strategy.flow, "call").mockImplementation(() => {
          const completion = requesters.get(strategyContext.runId)!({
            ...request,
            signal: strategyContext.signal,
          }).then(() => {
            throw new Error("Question should be cancelled");
          });
          return Object.assign(completion, { abort() {} });
        });
      },
    });
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    let receiveQuestion: (question: QuestionRequested) => void = () => {};
    const question = new Promise<QuestionRequested>((resolve) => {
      receiveQuestion = resolve;
    });
    await questions.notifications.subscribe(
      "run_question_requested",
      "root",
      receiveQuestion,
    );
    const completion = runs.startRun("root", "child").completion;
    const notification = await question;
    await runs.stopRun("root");
    expect((await completion).status).toBe(RunOutcomeStatus.stopped);
    expect(questions.getPendingQuestions("root")).toEqual([]);
    expect(
      questions.resolveQuestion(
        notification.runId,
        notification.requestId,
        "late",
      ),
    ).toBe(false);
    await runs.dispose();
    await questions.dispose();
  });

  test("should reject pending requests on disposal and prevent new subscriptions and run preparation", async () => {
    const { runs, questions, requesters, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    const response = requesters.get("root")!(request);
    const first = questions.dispose();
    expect(questions.dispose()).toBe(first);
    await first;
    await expect(response).rejects.toThrow("cleaned up");
    expect(questions.getPendingQuestions("root")).toEqual([]);
    await expect(
      questions.notifications.subscribe(
        "run_question_requested",
        "root",
        () => {},
      ),
    ).rejects.toThrow("disposed");
    await expect(
      runs.prepareRun({
        runId: "later",
        configuration: {
          strategyPath: "example.json",
          cwd,
        },
      }),
    ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
    await runs.dispose();
  });

  test("should stream pending and new questions over the watch channel and answer them by command", async () => {
    const { runs, questions, requesters, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: { strategyPath: "example.json", cwd },
    });
    const earlier = requesters.get("root")!(request);
    const messages: unknown[] = [];
    const controller = new AbortController();
    const channel = await questions.server.channels[0]!.open(
      { runId: "root" },
      {
        signal: controller.signal,
        send(message) {
          messages.push(message);
        },
        end() {},
      },
    );
    try {
      const later = requesters.get("root")!({
        ...request,
        question: "Second?",
      });
      expect(messages).toMatchObject([
        {
          type: "question.requested",
          data: { runId: "root", question: request.question },
        },
        { type: "question.requested", data: { question: "Second?" } },
      ]);
      const [first] = questions.getPendingQuestions("root");
      const answered = await questions.server.commands[0]!.invoke({
        runId: "root",
        requestId: first!.requestId,
        response: "yes",
      });
      expect(answered).toEqual({ answered: true });
      expect(await earlier).toBe("yes");
      expect(messages.at(-1)).toEqual({
        type: "question.resolved",
        data: { runId: "root", requestId: first!.requestId },
      });
      questions.resolveQuestion(
        "root",
        questions.getPendingQuestions("root")[0]!.requestId,
        "no",
      );
      expect(await later).toBe("no");
    } finally {
      controller.abort();
      await channel?.cleanup?.();
      await runs.dispose();
    }
  });
});
