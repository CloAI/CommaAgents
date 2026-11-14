import { WatchQuestionsMessageSchema } from "./server/channels/watch-questions/watch-questions.schemas";
import { RunOutcomeStatus } from "../runs/state/state.schemas";
import { afterEach, describe, expect, vi, test } from "vitest";
import { realpathSync } from "node:fs";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  createRunDirectory,
} from "../runs/test.utils";
import { createQuestionsPlugin } from "./questions";
import type { QuestionRequested } from "./questions.notifications";
import { QuestionsSchema } from "@comma-agents/core";
import type { QuestionsRequester, QuestionsResponse } from "@comma-agents/core";

afterEach(cleanupRunFixtures);

function fixture() {
  const requesters = new Map<string, QuestionsRequester>();
  const loader = fakeLoader({ loads: [], restored: [] });
  const runs = createMockRunsPlugin({
    runsDir: createRunDirectory(),
    async loadStrategy(options) {
      const requester = options.strategyInputs.questionsRequester;
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
  toolName: "ask_questions",
  ...QuestionsSchema.parse({
    questions: [
      {
        id: "configuration",
        prompt: "Which configuration should I use?",
        fields: [
          { id: "text", type: "text", label: "Configuration", required: false },
        ],
      },
    ],
  }),
};

function textResponse(text: string): QuestionsResponse {
  return {
    answers: [
      { questionId: "configuration", type: "answered", values: { text } },
    ],
  };
}

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
    expect(() =>
      questions.submitAnswers(
        "wrong",
        notifications[0]!.requestId,
        crypto.randomUUID(),
        textResponse("ignored"),
      ),
    ).toThrow();
    expect(
      questions.submitAnswers(
        "root",
        notifications[0]!.requestId,
        crypto.randomUUID(),
        textResponse("existing"),
      ),
    ).toEqual({ accepted: true, replayed: false });
    expect(
      questions.submitAnswers(
        "root",
        notifications[1]!.requestId,
        crypto.randomUUID(),
        textResponse(""),
      ),
    ).toEqual({ accepted: true, replayed: false });
    expect(await first).toEqual(textResponse("existing"));
    expect(await second).toEqual(textResponse(""));
    expect(() =>
      questions.submitAnswers(
        "root",
        notifications[0]!.requestId,
        crypto.randomUUID(),
        textResponse("again"),
      ),
    ).toThrow();
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
        questions.submitAnswers(
          notification.runId,
          notification.requestId,
          crypto.randomUUID(),
          textResponse("use defaults"),
        );
      },
    );
    expect(pending).toEqual(received);
    expect(await response).toEqual(textResponse("use defaults"));
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
    expect(() =>
      questions.submitAnswers(
        "root",
        pending.requestId,
        crypto.randomUUID(),
        textResponse("late"),
      ),
    ).toThrow();
    await expect(
      requester({ ...request, signal: controller.signal }),
    ).rejects.toThrow("stopped");
    const next = requester(request);
    questions.submitAnswers(
      "root",
      questions.getPendingQuestions("root")[0]!.requestId,
      crypto.randomUUID(),
      textResponse("still active"),
    );
    expect(await next).toEqual(textResponse("still active"));
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
    questions.submitAnswers(
      "root",
      questions.getPendingQuestions("root")[0]!.requestId,
      crypto.randomUUID(),
      textResponse("continue"),
    );
    expect(await response).toEqual(textResponse("continue"));
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
        vi.spyOn(strategyContext.strategy.flow, "call").mockImplementation(
          () => {
            let flowCall: ReturnType<typeof call> | undefined;
            const completion = requesters.get(strategyContext.runId)!({
              ...request,
              signal: strategyContext.signal,
            }).then((response) => {
              flowCall = call(JSON.stringify(response));
              return flowCall;
            });
            return Object.assign(completion, {
              abort: () => flowCall?.abort(),
            });
          },
        );
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
    expect(() =>
      questions.submitAnswers(
        "root",
        notification.requestId,
        crypto.randomUUID(),
        textResponse("wrong"),
      ),
    ).toThrow();
    questions.submitAnswers(
      notification.runId,
      notification.requestId,
      crypto.randomUUID(),
      textResponse("nested answer"),
    );
    const outcome = await completion;
    expect(outcome.status).toBe(RunOutcomeStatus.completed);
    if (outcome.status === "completed") {
      expect(outcome.result.text).toBe(
        JSON.stringify(textResponse("nested answer")),
      );
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
        vi.spyOn(strategyContext.strategy.flow, "call").mockImplementation(
          () => {
            const completion = requesters.get(strategyContext.runId)!({
              ...request,
              signal: strategyContext.signal,
            }).then(() => {
              throw new Error("Question should be cancelled");
            });
            return Object.assign(completion, { abort() {} });
          },
        );
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
    expect(() =>
      questions.submitAnswers(
        notification.runId,
        notification.requestId,
        crypto.randomUUID(),
        textResponse("late"),
      ),
    ).toThrow();
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
        questions: [{ ...request.questions[0]!, prompt: "Second?" }],
      });
      expect(channel?.initial).toMatchObject({
        type: "questions.snapshot",
        data: { requests: [{ runId: "root", questions: request.questions }] },
      });
      expect(messages).toMatchObject([
        {
          type: "question.requested",
          data: { questions: [{ prompt: "Second?" }] },
        },
      ]);
      const [first] = questions.getPendingQuestions("root");
      const answered = await questions.server.commands[0]!.invoke({
        runId: "root",
        requestId: first!.requestId,
        submissionId: crypto.randomUUID(),
        response: textResponse("yes"),
      });
      expect(answered).toEqual({ accepted: true, replayed: false });
      expect(await earlier).toEqual(textResponse("yes"));
      expect(messages.at(-1)).toEqual({
        type: "question.resolved",
        data: { runId: "root", requestId: first!.requestId },
      });
      questions.submitAnswers(
        "root",
        questions.getPendingQuestions("root")[0]!.requestId,
        crypto.randomUUID(),
        textResponse("no"),
      );
      expect(await later).toEqual(textResponse("no"));
    } finally {
      controller.abort();
      await channel?.cleanup?.();
      await runs.dispose();
    }
  });
});

test("should reject a partial questionnaire atomically and replay only an identical submission", async () => {
  const { runs, questions, requesters, cwd } = fixture();
  await runs.prepareRun({
    runId: "root",
    configuration: { strategyPath: "example.json", cwd },
  });
  const questionnaire = {
    ...request,
    questions: [
      request.questions[0]!,
      { ...request.questions[0]!, id: "second" },
    ],
  };
  const response = requesters.get("root")!(questionnaire);
  const pending = questions.getPendingQuestions("root")[0]!;
  const submissionId = crypto.randomUUID();
  expect(() =>
    questions.submitAnswers(
      "root",
      pending.requestId,
      submissionId,
      textResponse("incomplete"),
    ),
  ).toThrow("correct");
  expect(questions.getPendingQuestions("root")).toEqual([pending]);
  const complete: QuestionsResponse = {
    answers: [
      { questionId: "configuration", type: "other", text: "Deployment only." },
      { questionId: "second", type: "skipped" },
    ],
  };
  expect(
    questions.submitAnswers("root", pending.requestId, submissionId, complete),
  ).toEqual({ accepted: true, replayed: false });
  expect(await response).toEqual(complete);
  expect(
    questions.submitAnswers("root", pending.requestId, submissionId, complete),
  ).toEqual({ accepted: true, replayed: true });
  expect(() =>
    questions.submitAnswers(
      "root",
      pending.requestId,
      submissionId,
      textResponse("changed"),
    ),
  ).toThrow("already been submitted");
  expect(() =>
    questions.submitAnswers(
      "root",
      pending.requestId,
      crypto.randomUUID(),
      complete,
    ),
  ).toThrow("already been submitted");
  await runs.stopRun("root");
  expect(() =>
    questions.submitAnswers("root", pending.requestId, submissionId, complete),
  ).toThrow("no longer pending");
  await runs.dispose();
  await questions.dispose();
});

test("should reject malformed requests and preserve a pending request after invalid typed answers", async () => {
  const { runs, questions, requesters, cwd } = fixture();
  await runs.prepareRun({
    runId: "root",
    configuration: { strategyPath: "example.json", cwd },
  });
  const requester = requesters.get("root")!;
  expect(() => requester({ ...request, questions: [] })).toThrow();
  const questionnaire = {
    ...request,
    ...QuestionsSchema.parse({
      questions: [
        {
          id: "select",
          prompt: "Choose",
          fields: [
            {
              id: "choice",
              label: "Choice",
              type: "choice",
              options: [{ id: "a", label: "A" }],
            },
          ],
        },
      ],
    }),
  };
  const response = requester(questionnaire);
  const pending = questions.getPendingQuestions("root")[0]!;
  expect(() =>
    questions.submitAnswers("root", pending.requestId, "invalid", {
      answers: [
        {
          questionId: "select",
          type: "answered",
          values: { choice: ["unknown"] },
        },
      ],
    }),
  ).toThrow("correct");
  expect(questions.getPendingQuestions("root")).toEqual([pending]);
  questions.submitAnswers("root", pending.requestId, "skip", {
    answers: [{ questionId: "select", type: "skipped" }],
  });
  expect(await response).toEqual({
    answers: [{ questionId: "select", type: "skipped" }],
  });
  await runs.dispose();
  await questions.dispose();
});

test("should keep accepted receipts and validation definitions isolated from consumer mutation", async () => {
  const { runs, questions, requesters, cwd } = fixture();
  await runs.prepareRun({
    runId: "root",
    configuration: { strategyPath: "example.json", cwd },
  });
  const response = requesters.get("root")!(request);
  const pending = questions.getPendingQuestions("root")[0]!;
  // A subscriber receives a snapshot rather than the constraints used to validate submissions.
  (pending.questions[0]!.fields as unknown as unknown[]).splice(0);
  const original = textResponse("original");
  const submissionId = crypto.randomUUID();
  expect(() =>
    questions.submitAnswers("root", pending.requestId, "invalid", {
      answers: [
        {
          questionId: "configuration",
          type: "answered",
          values: { unknown: "value" },
        },
      ],
    }),
  ).toThrow("correct");
  questions.submitAnswers("root", pending.requestId, submissionId, original);
  const result = await response;
  const answer = result.answers[0];
  if (answer?.type === "answered") {
    answer.values.text = "changed by consumer";
  }
  expect(
    questions.submitAnswers("root", pending.requestId, submissionId, original),
  ).toEqual({ accepted: true, replayed: true });
  await runs.dispose();
  await questions.dispose();
});

type QuestionsCommands =
  import("../../daemon-server/messages/messages.contracts.types").PluginCommandMap<{
    questions: ReturnType<typeof createQuestionsPlugin>;
  }>;
type SubmitArguments = QuestionsCommands["questions.submit"]["arguments"];

test("should preserve structured submission arguments in this plugin's inferred contract", () => {
  const valid: SubmitArguments = {
    runId: "root",
    requestId: "request",
    submissionId: "submission",
    response: textResponse("answer"),
  };
  const invalid: SubmitArguments = {
    runId: "root",
    requestId: "request",
    submissionId: "submission",
    // @ts-expect-error Text-only legacy responses must not compile as questionnaire submissions.
    response: "answer",
  };
  void invalid;
  expect(valid.response.answers).toHaveLength(1);
});

test("should not publish an already-resolved request after a synchronous responder has completed it", async () => {
  const { runs, questions, requesters, cwd } = fixture();
  await runs.prepareRun({
    runId: "root",
    configuration: { strategyPath: "example.json", cwd },
  });
  await questions.notifications.subscribe(
    "run_question_requested",
    "root",
    (pending) => {
      questions.submitAnswers(
        "root",
        pending.requestId,
        crypto.randomUUID(),
        textResponse("immediate"),
      );
    },
  );
  const messages: unknown[] = [];
  const subscription = await questions.server.channels[0]!.open(
    { runId: "root" },
    {
      signal: new AbortController().signal,
      send: (message) => {
        messages.push(message);
      },
      end() {},
    },
  );
  expect(await requesters.get("root")!(request)).toEqual(
    textResponse("immediate"),
  );
  expect(messages).toEqual([
    {
      type: "question.resolved",
      data: { runId: "root", requestId: expect.any(String) },
    },
  ]);
  await subscription?.cleanup?.();
  await runs.dispose();
  await questions.dispose();
});

test("should replace missed resolutions with an authoritative snapshot when the watch channel reopens", async () => {
  const { runs, questions, requesters, cwd } = fixture();
  await runs.prepareRun({
    runId: "root",
    configuration: { strategyPath: "example.json", cwd },
  });
  const first = requesters.get("root")!(request);
  const second = requesters.get("root")!(request);
  const open = () =>
    questions.server.channels[0]!.open(
      { runId: "root" },
      { signal: new AbortController().signal, send() {}, end() {} },
    );
  const initial = await open();
  expect(initial?.initial).toMatchObject({
    type: "questions.snapshot",
    data: {
      requests: [
        { requestId: expect.any(String) },
        { requestId: expect.any(String) },
      ],
    },
  });
  await initial?.cleanup?.();
  const [resolved, pending] = questions.getPendingQuestions("root");
  questions.submitAnswers(
    "root",
    resolved!.requestId,
    "first",
    textResponse("answered offline"),
  );
  await first;
  const reopened = await open();
  expect(reopened?.initial).toMatchObject({
    type: "questions.snapshot",
    data: { requests: [{ requestId: pending!.requestId }] },
  });
  const snapshot = WatchQuestionsMessageSchema.parse(reopened?.initial);
  if (snapshot.type !== "questions.snapshot") {
    throw new Error("Expected authoritative snapshot");
  }
  expect(snapshot.data.requests).toHaveLength(1);
  await reopened?.cleanup?.();
  questions.submitAnswers(
    "root",
    pending!.requestId,
    "second",
    textResponse("finished"),
  );
  await second;
  const empty = await open();
  expect(empty?.initial).toEqual({
    type: "questions.snapshot",
    data: { requests: [] },
  });
  await empty?.cleanup?.();
  await runs.dispose();
  await questions.dispose();
});
