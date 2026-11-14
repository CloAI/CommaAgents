import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentStreamEvent } from "@comma-agents/core";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  fakeLoader,
  directories,
  createRunDirectory,
} from "../../../test.utils";
import type { RunsChannelMessage } from "./runs.types";
import * as storageModule from "../../../state/storage/storage";
import { RunsMessageSchema } from "./runs.schemas";

afterEach(cleanupRunFixtures);

describe("runs channel initialization", () => {
  it("should read history once and deliver completed messages that arrive during the read", async () => {
    const runs = createMockRunsPlugin({
      runsDir: createRunDirectory(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const prepared = await runs.prepareRun({
      configuration: { strategyPath: "example.json" },
    });
    const getHistory = runs.getHistory;
    const reading = vi
      .spyOn(runs, "getHistory")
      .mockImplementationOnce(async (runId, options) => {
        const stale = await getHistory(runId, options);
        await runs.startRun(runId, "during hydration").completion;
        await runs.prepareRun({ runId });
        await runs.startRun(runId, "next execution").completion;
        return stale;
      });
    const messages: RunsChannelMessage[] = [];
    const controller = new AbortController();
    try {
      const subscription = await runs.server!.channels![0]!.open(
        { runId: prepared.runId },
        {
          signal: controller.signal,
          send(message) {
            messages.push(RunsMessageSchema.parse(message));
          },
          end() {},
        },
      );
      const initial = RunsMessageSchema.parse(subscription?.initial);
      expect(initial).toMatchObject({
        type: "run.initial",
        data: {
          snapshot: { phase: "terminal", outcome: { status: "completed" } },
        },
      });
      if (initial.type !== "run.initial") {
        throw new Error("Expected initialized run");
      }
      expect(initial.data.history.entries).toEqual([]);
      expect(
        messages.filter(
          (message) =>
            message.type === "user.input" || message.type === "agent.output",
        ),
      ).toMatchObject([
        {
          type: "user.input",
          data: { content: [{ text: "during hydration" }] },
        },
        {
          type: "agent.output",
          data: {
            status: "completed",
            content: [{ text: "during hydration" }],
          },
        },
        { type: "user.input", data: { content: [{ text: "next execution" }] } },
        {
          type: "agent.output",
          data: { status: "completed", content: [{ text: "next execution" }] },
        },
      ]);
      expect(
        messages.some(
          (message) =>
            message.type === "agent.stream" || message.type === "run.state",
        ),
      ).toBe(false);
      expect(reading).toHaveBeenCalledTimes(1);
      await subscription?.cleanup?.();
    } finally {
      controller.abort();
      reading.mockRestore();
      await runs.dispose();
    }
  });

  it("should omit buffered text and final outputs already represented by history", async () => {
    const runs = createMockRunsPlugin({
      runsDir: createRunDirectory(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const prepared = await runs.prepareRun({
      configuration: { strategyPath: "example.json" },
    });
    const getHistory = runs.getHistory;
    const reading = vi
      .spyOn(runs, "getHistory")
      .mockImplementationOnce(async (runId, options) => {
        await runs.startRun(runId, "already saved").completion;
        return getHistory(runId, options);
      });
    const messages: RunsChannelMessage[] = [];
    const controller = new AbortController();
    try {
      const subscription = await runs.server!.channels![0]!.open(
        { runId: prepared.runId },
        {
          signal: controller.signal,
          send(message) {
            messages.push(RunsMessageSchema.parse(message));
          },
          end() {},
        },
      );
      expect(subscription?.initial).toMatchObject({
        type: "run.initial",
        data: {
          history: {
            entries: [{ role: "user" }, { role: "agent", status: "completed" }],
          },
        },
      });
      expect(
        messages.some(
          (message) =>
            message.type === "agent.stream" ||
            message.type === "agent.output" ||
            message.type === "user.input",
        ),
      ).toBe(false);
      expect(reading).toHaveBeenCalledTimes(1);
      await subscription?.cleanup?.();
    } finally {
      controller.abort();
      reading.mockRestore();
      await runs.dispose();
    }
  });

  it("should connect during streaming and hand current text over to subsequent live updates", async () => {
    const loader = fakeLoader({ loads: [], restored: [] });
    const runs = createMockRunsPlugin({
      runsDir: createRunDirectory(),
      async loadStrategy(options) {
        const strategy = await loader(options);
        return {
          ...strategy,
          agents: {
            writer: {
              ...strategy.agents.writer!,
              config: { name: "writer", model: "mock/model" },
            },
          },
        };
      },
    });
    const streamed = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    runs.registerStrategyHooks({
      name: "hold-stream",
      attach({ strategy }) {
        strategy.agents.writer!.appendHook?.(
          "onStreamEvent",
          async (event: AgentStreamEvent) => {
            if (event.type === "text" && event.text === "first chunk") {
              streamed.resolve();
              await release.promise;
            }
          },
        );
      },
    });
    const prepared = await runs.prepareRun({
      configuration: { strategyPath: "example.json" },
    });
    const getHistory = runs.getHistory;
    let execution: ReturnType<typeof runs.startRun> | undefined;
    const reading = vi
      .spyOn(runs, "getHistory")
      .mockImplementationOnce(async (runId, options) => {
        const page = await getHistory(runId, options);
        execution = runs.startRun(runId, "answer");
        await streamed.promise;
        return page;
      });
    const messages: RunsChannelMessage[] = [];
    const controller = new AbortController();
    try {
      const subscription = await runs.server!.channels![0]!.open(
        { runId: prepared.runId },
        {
          signal: controller.signal,
          send(message) {
            messages.push(RunsMessageSchema.parse(message));
          },
          end() {},
        },
      );
      expect(subscription?.initial).toMatchObject({
        type: "run.initial",
        data: {
          snapshot: { phase: "running" },
          activeAgents: [
            {
              runId: prepared.runId,
              agentName: "writer",
              messageId: expect.any(String),
              createdAt: expect.any(String),
            },
          ],
        },
      });
      expect(
        messages.filter((message) => message.type === "agent.stream"),
      ).toMatchObject([{ data: { content: { text: "first chunk" } } }]);
      expect(reading).toHaveBeenCalledTimes(1);
      release.resolve();
      await execution!.completion;
      expect(
        messages.filter((message) => message.type === "agent.stream"),
      ).toMatchObject([
        { data: { content: { text: "first chunk" } } },
        { data: { content: { text: "first chunksecond chunk" } } },
      ]);
      expect(
        messages.filter((message) => message.type === "agent.output"),
      ).toMatchObject([
        { data: { status: "completed", content: [{ text: "answer" }] } },
      ]);
      await subscription?.cleanup?.();
    } finally {
      release.resolve();
      await execution?.completion;
      controller.abort();
      reading.mockRestore();
      await runs.dispose();
    }
  });

  it("should open without waiting for a pending conversation write", async () => {
    const runsDir = createRunDirectory();
    const backing = storageModule.createRunStorage(directories.at(-1)!);
    const saving = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const storage = vi
      .spyOn(storageModule, "createRunStorage")
      .mockReturnValue({
        ...backing,
        async append(runId, event) {
          saving.resolve();
          await release.promise;
          await backing.append(runId, event);
        },
      });
    const runs = createMockRunsPlugin({
      runsDir,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    let execution: ReturnType<typeof runs.startRun> | undefined;
    const controller = new AbortController();
    try {
      const prepared = await runs.prepareRun({
        configuration: { strategyPath: "example.json" },
      });
      execution = runs.startRun(prepared.runId, "answer");
      await saving.promise;
      const subscription = await runs.server!.channels![0]!.open(
        { runId: prepared.runId },
        { signal: controller.signal, send() {}, end() {} },
      );
      expect(subscription?.initial).toMatchObject({
        type: "run.initial",
        data: {
          snapshot: { phase: "running" },
          history: { entries: [{ role: "user" }] },
        },
      });
      await subscription?.cleanup?.();
    } finally {
      release.resolve();
      await execution?.completion;
      controller.abort();
      await runs.dispose();
      storage.mockRestore();
    }
  });

  it("should let two clients inspect an archived run and follow a later preparation", async () => {
    const runsDir = createRunDirectory();
    const original = createMockRunsPlugin({
      runsDir,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await original.prepareRun({
      runId: "archived",
      configuration: { strategyPath: "example.json" },
    });
    await original.startRun("archived", "saved answer").completion;
    await original.dispose();
    const path = join(directories.at(-1)!, "archived", "run.json");
    const saved = readFileSync(path, "utf8");
    const observed = { loads: [] as string[], restored: [] as string[][] };
    const runs = createMockRunsPlugin({
      runsDir,
      loadStrategy: fakeLoader(observed),
    });
    const clients: RunsChannelMessage[][] = [[], []];
    const controller = new AbortController();
    try {
      const subscriptions = await Promise.all(
        clients.map((messages) =>
          runs.server!.channels![0]!.open(
            { runId: "archived" },
            {
              signal: controller.signal,
              send(message) {
                messages.push(RunsMessageSchema.parse(message));
              },
              end() {},
            },
          ),
        ),
      );
      for (const subscription of subscriptions) {
        expect(subscription?.initial).toMatchObject({
          type: "run.initial",
          data: {
            snapshot: { phase: "terminal", outcome: { status: "completed" } },
            history: { entries: [{ role: "user" }, { role: "agent" }] },
            pendingInputs: [],
          },
        });
      }
      expect(observed.loads).toEqual([]);
      expect(readFileSync(path, "utf8")).toBe(saved);
      await runs.prepareRun({ runId: "archived" });
      await runs.startRun("archived", "new answer").completion;
      for (const messages of clients) {
        expect(
          messages.filter((message) => message.type === "agent.output"),
        ).toMatchObject([{ data: { content: [{ text: "new answer" }] } }]);
      }
      await Promise.all(
        subscriptions.map((subscription) => subscription?.cleanup?.()),
      );
    } finally {
      controller.abort();
      await runs.dispose();
    }
  });

  it("should release a listener acquired after cancellation and stop registering listeners", async () => {
    const runs = createMockRunsPlugin({
      runsDir: createRunDirectory(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const prepared = await runs.prepareRun({
      configuration: { strategyPath: "example.json" },
    });
    const registering = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let cleanups = 0;
    const subscribing = vi
      .spyOn(runs.notifications, "subscribe")
      .mockImplementationOnce(async () => {
        registering.resolve();
        await release.promise;
        return () => {
          cleanups++;
        };
      });
    const controller = new AbortController();
    try {
      const opening = runs.server!.channels![0]!.open(
        { runId: prepared.runId },
        { signal: controller.signal, send() {}, end() {} },
      );
      const stopped = Promise.resolve(opening).catch((error: unknown) => error);
      await registering.promise;
      controller.abort();
      release.resolve();
      expect(await stopped).toMatchObject({ name: "AbortError" });
      expect(cleanups).toBe(1);
      expect(subscribing).toHaveBeenCalledTimes(1);
    } finally {
      release.resolve();
      subscribing.mockRestore();
      await runs.dispose();
    }
  });
});
