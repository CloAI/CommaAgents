import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { RunStorage } from "../state/storage/storage.types";
import * as storageModule from "../state/storage/storage";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  repository,
} from "../test.utils";
import { RunErrorCode } from "../errors";
import { createAgent } from "../../../../../core/src/agents/agent/agent";
import { createUserAgent } from "../../../../../core/src/agents/built-in/user/user-agent";
import { createCycleFlow } from "../../../../../core/src/flows/built-in/cycle/cycle-flow";
import { createSequentialFlow } from "../../../../../core/src/flows/built-in/sequential/sequential-flow";
import { registerModel } from "../../../../../core/src/model/model";
import type { LanguageModel } from "ai";
import type { LoadedStrategy } from "@comma-agents/core";
import { initialInputAgent } from "./execution.utils";
afterEach(cleanupRunFixtures);
describe("run execution", () => {
  it("should seed only a starting interactive user step through sequential or cycle flows", () => {
    const userAgent = createUserAgent({
      name: "user",
      inputCollector: async () => "answer",
    });
    const base: LoadedStrategy = {
      name: "Input",
      version: "1",
      agents: { user: userAgent },
      flow: createSequentialFlow({ name: "Main", steps: [userAgent] }),
      raw: {
        name: "Input",
        version: "1",
        agents: {
          user: { type: "user" },
          preset: { type: "user", config: { requireInput: false } },
          expert: { model: "mock/model" },
        },
        flow: { name: "Main", type: "sequential", steps: [{ agent: "user" }] },
      },
    };
    const cases: Array<{
      flow: LoadedStrategy["raw"]["flow"];
      expected: string | undefined;
    }> = [
      { flow: base.raw.flow, expected: "user" },
      {
        flow: {
          name: "Outer",
          type: "sequential",
          steps: [
            {
              name: "Loop",
              type: "cycle",
              cycles: "Infinity",
              steps: [{ agent: "user" }, { agent: "expert" }],
            },
          ],
        },
        expected: "user",
      },
      {
        flow: {
          name: "Later",
          type: "sequential",
          steps: [{ agent: "expert" }, { agent: "user" }],
        },
        expected: undefined,
      },
      {
        flow: {
          name: "Preset",
          type: "sequential",
          steps: [{ agent: "preset" }, { agent: "user" }],
        },
        expected: undefined,
      },
      {
        flow: { name: "Fanout", type: "broadcast", steps: [{ agent: "user" }] },
        expected: undefined,
      },
      {
        flow: {
          name: "Nested fanout",
          type: "cycle",
          steps: [
            { name: "Fanout", type: "broadcast", steps: [{ agent: "user" }] },
          ],
        },
        expected: undefined,
      },
    ];
    for (const { flow, expected } of cases) {
      expect(initialInputAgent({ ...base, raw: { ...base.raw, flow } })).toBe(
        expected,
      );
    }
  });
  it("should reject a start during prepared cleanup and make concurrent stops await the same resources", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const cleaning = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let cleanups = 0;
    runs.registerRunPreparation({
      name: "resource",
      prepare() {
        return {
          strategyInputs: {},
          async dispose() {
            cleanups++;
            cleaning.resolve();
            await release.promise;
          },
        };
      },
    });
    try {
      await runs.prepareRun({
        runId: "stopping",
        configuration: { strategyPath: "example.json" },
      });
      const stopping = runs.stopRun("stopping");
      await cleaning.promise;
      let secondFinished = false;
      const second = runs.stopRun("stopping").then(() => {
        secondFinished = true;
      });
      expect(() => runs.startRun("stopping")).toThrow("Run is busy");
      await Promise.resolve();
      expect(secondFinished).toBe(false);
      release.resolve();
      await Promise.all([stopping, second]);
      expect(cleanups).toBe(1);
      expect(await runs.getRun("stopping")).toMatchObject({
        phase: "terminal",
        outcome: { status: "stopped" },
      });
    } finally {
      release.resolve();
      await runs.dispose();
    }
  });

  it("should enforce the same lifecycle and input rules without the server", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({
      runId: "interactive",
      configuration: { strategyPath: "example.json" },
    });
    const inputs: string[] = [];
    const ready = Promise.withResolvers<void>();
    await runs.notifications.subscribe(
      "run_input_requested",
      "interactive",
      ({ inputId }) => {
        inputs.push(inputId);
        if (inputs.length === 2) {
          ready.resolve();
        }
      },
    );
    const execution = runs.startRun("interactive", "needs-input");
    expect(() => runs.startRun("interactive")).toThrow("Run is busy");
    await ready.promise;
    await expect(
      runs.steerRun("interactive", "steering", "stale"),
    ).rejects.toMatchObject({ code: RunErrorCode.INVALID_ARGUMENTS });
    await runs.resolveInput("interactive", inputs[0]!, "one");
    await expect(
      runs.resolveInput("interactive", inputs[0]!, "duplicate"),
    ).rejects.toMatchObject({ code: RunErrorCode.INPUT_NOT_FOUND });
    await runs.resolveInput("interactive", inputs[1]!, "two");
    expect(await execution.completion).toMatchObject({
      status: "completed",
      summary: { text: "one,two" },
    });
    await expect(
      runs.steerRun("interactive", "late", "stale"),
    ).rejects.toMatchObject({ code: RunErrorCode.INVALID_RUN_STATE });
    await runs.stopRun("interactive");
    await expect(runs.stopRun("missing")).rejects.toMatchObject({
      code: RunErrorCode.RUN_NOT_FOUND,
    });
    await runs.dispose();
  });
  it("should consume the first prompt once, wait for the next human answer and display each submission once", async () => {
    const expertInputs: string[] = [];
    const runs = createMockRunsPlugin({
      repository: repository(),
      async loadStrategy({ inputCollector }) {
        const userAgent = createUserAgent({
          name: "user",
          requireInput: true,
          inputCollector,
        });
        const expertAgent = createAgent({
          name: "expert",
          execute: async (message) => {
            expertInputs.push(message);
            return `answer:${message}`;
          },
        });
        return {
          name: "Chat",
          version: "1",
          agents: { user: userAgent, expert: expertAgent },
          raw: {
            name: "Chat",
            version: "1",
            agents: {
              user: { type: "user", config: { requireInput: true } },
              expert: { model: "mock/model" },
            },
            flow: {
              name: "Chat",
              type: "cycle",
              cycles: 2,
              steps: [{ agent: "user" }, { agent: "expert" }],
            },
          },
          flow: createCycleFlow({
            name: "Chat",
            cycles: 2,
            steps: [userAgent, expertAgent],
          }),
        };
      },
    });
    try {
      await runs.prepareRun({
        runId: "two-turns",
        configuration: { strategyPath: "chat.json" },
      });
      const waiting = Promise.withResolvers<string>();
      const requests: string[] = [];
      await runs.notifications.subscribe(
        "run_input_requested",
        "two-turns",
        ({ inputId }) => {
          requests.push(inputId);
          waiting.resolve(inputId);
        },
      );
      const execution = runs.startRun("two-turns", "hello");
      const inputId = await waiting.promise;
      expect(expertInputs).toEqual(["hello"]);
      expect(requests).toHaveLength(1);
      await runs.resolveInput("two-turns", inputId, "second question");
      expect(await execution.completion).toMatchObject({ status: "completed" });
      expect(expertInputs).toEqual(["hello", "second question"]);
      const history = await runs.getHistory("two-turns");
      expect(
        history.entries
          .filter((item) => item.type === "message")
          .map((item) =>
            item.type === "message" ? [item.role, item.content] : null,
          ),
      ).toEqual([
        ["user", [{ type: "text", text: "hello" }]],
        ["agent", [{ type: "text", text: "answer:hello" }]],
        ["user", [{ type: "text", text: "second question" }]],
        ["agent", [{ type: "text", text: "answer:second question" }]],
      ]);
    } finally {
      await runs.dispose();
    }
  });
  it("should persist targeted steering and partial output while the same agent resumes without failing the run", async () => {
    const requests: string[] = [];
    const model: LanguageModel = {
      specificationVersion: "v3",
      provider: "steering-test",
      modelId: "writer",
      supportedUrls: {},
      async doGenerate() {
        throw new Error("Streaming required");
      },
      async doStream(options) {
        requests.push(JSON.stringify(options.prompt));
        const initial = requests.length === 1;
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "text-start", id: "answer" });
              controller.enqueue({
                type: "text-delta",
                id: "answer",
                delta: initial ? "partial answer" : "steered answer",
              });
              if (initial) {
                const stop = () =>
                  controller.error(new DOMException("Steered", "AbortError"));
                if (options.abortSignal?.aborted) {
                  stop();
                } else {
                  options.abortSignal?.addEventListener("abort", stop, {
                    once: true,
                  });
                }
              } else {
                controller.enqueue({ type: "text-end", id: "answer" });
                controller.enqueue({
                  type: "finish",
                  finishReason: { unified: "stop", raw: undefined },
                  usage: {
                    inputTokens: {
                      total: 2,
                      noCache: undefined,
                      cacheRead: undefined,
                      cacheWrite: undefined,
                    },
                    outputTokens: {
                      total: 1,
                      text: undefined,
                      reasoning: undefined,
                    },
                  },
                });
                controller.close();
              }
            },
          }),
        };
      },
    };
    registerModel("mock/steered-run", model);
    const runs = createMockRunsPlugin({
      repository: repository(),
      async loadStrategy() {
        const writerAgent = createAgent({
          name: "writer",
          model: "mock/steered-run",
        });
        return {
          name: "Steering",
          version: "1",
          agents: { writer: writerAgent },
          raw: {
            name: "Steering",
            version: "1",
            agents: { writer: { model: "mock/steered-run" } },
            flow: {
              name: "Main",
              type: "sequential",
              steps: [{ agent: "writer" }],
            },
          },
          flow: createSequentialFlow({ name: "Main", steps: [writerAgent] }),
        };
      },
    });
    try {
      await runs.prepareRun({
        runId: "steered",
        configuration: { strategyPath: "writer.json" },
      });
      const streaming = Promise.withResolvers<string>();
      const started: string[] = [];
      await runs.notifications.subscribe(
        "run_agent_started",
        "steered",
        ({ messageId }) => {
          started.push(messageId);
        },
      );
      await runs.notifications.subscribe(
        "run_message_stream",
        "steered",
        ({ messageId }) => {
          streaming.resolve(messageId);
        },
      );
      const execution = runs.startRun("steered", "original task");
      const messageId = await streaming.promise;
      await runs.steerRun("steered", "focus on the correction", messageId);
      expect(await execution.completion).toMatchObject({
        status: "completed",
        summary: { text: "steered answer" },
      });
      expect(started).toHaveLength(2);
      expect(requests[1]).toContain("partial answer");
      expect(requests[1]).toContain("focus on the correction");
      expect((await runs.getHistory("steered")).entries).toMatchObject([
        { role: "user", content: [{ text: "original task" }] },
        {
          role: "agent",
          status: "stopped",
          cancellationReason: "user_steering",
          content: [{ text: "partial answer" }],
        },
        { role: "user", content: [{ text: "focus on the correction" }] },
        {
          role: "agent",
          status: "completed",
          content: [{ text: "steered answer" }],
        },
      ]);
      await expect(
        runs.steerRun("steered", "late", messageId),
      ).rejects.toMatchObject({ code: "INVALID_RUN_STATE" });
    } finally {
      await runs.dispose();
    }
  });
  it("should fail visibly and refuse restoration when canonical persistence fails", async () => {
    const legacy = repository();
    const backing = storageModule.createRunStorage(directories.at(-1)!);
    const failing: RunStorage = {
      ...backing,
      async append() {
        throw new Error("Private filesystem diagnosis");
      },
    };
    const mock = spyOn(storageModule, "createRunStorage").mockReturnValue(
      failing,
    );
    const runs = createMockRunsPlugin({
      repository: legacy,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    try {
      await runs.prepareRun({
        runId: "broken",
        configuration: { strategyPath: "example.json" },
      });
      expect(await runs.startRun("broken", "input").completion).toMatchObject({
        status: "failed",
        error: { code: RunErrorCode.PERSISTENCE_ERROR },
      });
      const snapshot = await runs.getRun("broken");
      expect(JSON.stringify(snapshot)).not.toContain(
        "Private filesystem diagnosis",
      );
      await expect(runs.prepareRun({ runId: "broken" })).rejects.toMatchObject({
        code: RunErrorCode.PERSISTENCE_ERROR,
      });
    } finally {
      await runs.dispose();
      mock.mockRestore();
    }
  });
  it("should wait for canonical persistence before final display delivery", async () => {
    const legacy = repository();
    const backing = storageModule.createRunStorage(directories.at(-1)!);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const mock = spyOn(storageModule, "createRunStorage").mockReturnValue({
      ...backing,
      async append(runId, event) {
        entered.resolve();
        await release.promise;
        await backing.append(runId, event);
      },
    });
    const runs = createMockRunsPlugin({
      repository: legacy,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    try {
      await runs.prepareRun({
        runId: "durable",
        configuration: { strategyPath: "example.json" },
      });
      const finished: string[] = [];
      await runs.notifications.subscribe(
        "run_message_output",
        "durable",
        ({ message }) => {
          if (message.role === "agent") {
            finished.push(message.messageId);
          }
        },
      );
      const execution = runs.startRun("durable", "answer");
      await entered.promise;
      expect(finished).toEqual([]);
      release.resolve();
      await execution.completion;
      expect(finished).toEqual([
        (await backing.conversation("durable"))[0]?.type === "agent_call"
          ? (
              (await backing.conversation("durable"))[0] as Extract<
                Awaited<ReturnType<typeof backing.conversation>>[number],
                { type: "agent_call" }
              >
            ).record.id
          : "missing",
      ]);
    } finally {
      release.resolve();
      await runs.dispose();
      mock.mockRestore();
    }
  });
});
