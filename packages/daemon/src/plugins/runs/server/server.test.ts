import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { AgentStreamEvent } from "@comma-agents/core";
import { createDaemonServer } from "../../../daemon-server";
import type { DaemonServer, PluginServerMessage } from "../../../daemon-server";
import { connectSocket } from "../../../daemon-server/test.utils";
import {
  cleanupRunFixtures,
  directories,
  createMockRunsPlugin,
  fakeLoader,
  repository,
} from "../test.utils";
import * as storageModule from "../state/storage/storage";
import { RunOutcomeStatus, RunPhase } from "../state/state.schemas";
import { RunsMessageSchema } from "./channels/runs/runs.schemas";
import { GetHistoryArgumentsSchema } from "./commands/get-history/get-history.schemas";

const servers: DaemonServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  cleanupRunFixtures();
});

async function nextMatching(
  client: Awaited<ReturnType<typeof connectSocket>>,
  predicate: (message: PluginServerMessage) => boolean,
): Promise<PluginServerMessage> {
  while (true) {
    const message = await client.next();
    if (predicate(message)) {
      return message;
    }
  }
}

describe("runs WebSocket API", () => {
  it("should persist a strategy selection over the wire and start it only on the next send", async () => {
    const observed = { loads: [] as string[], restored: [] as string[][] };
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader(observed),
    });
    await runs.prepareRun({
      runId: "switching",
      configuration: { strategyPath: "/work/plan.json" },
    });
    const server = createDaemonServer({
      daemon: { plugins: { runs } },
      port: 0,
    });
    servers.push(server);
    await server.start();
    const client = await connectSocket(server.url);
    const switchId = crypto.randomUUID();
    const followId = crypto.randomUUID();
    const sendId = crypto.randomUUID();
    try {
      client.send({
        type: "command",
        requestId: switchId,
        command: "runs.switchStrategy",
        arguments: {
          runId: "switching",
          strategyPath: "/work/build.json",
          expectedRevision: 0,
        },
      });
      expect(await client.next()).toMatchObject({
        type: "response",
        ok: true,
        data: {
          runId: "switching",
          phase: "prepared",
          configuration: { strategyPath: "/work/build.json" },
          strategyState: { revision: 1 },
        },
      });
      expect(
        (await runs.getHistory("switching")).entries.map((entry) => entry.type),
      ).toEqual(["strategy.changed"]);
      client.send({
        type: "subscribe",
        requestId: followId,
        channel: "runs",
        arguments: { runId: "switching" },
      });
      expect(await client.next()).toMatchObject({ type: "response", ok: true });
      expect(await client.next()).toMatchObject({
        type: "run.initial",
        data: { history: { entries: [{ type: "strategy.changed" }] } },
      });
      client.send({
        type: "command",
        requestId: sendId,
        command: "runs.send",
        arguments: {
          runId: "switching",
          input: "Implement the plan",
          expectedRevision: 1,
        },
      });
      expect(
        await nextMatching(
          client,
          (message) =>
            message.type === "response" && message.requestId === sendId,
        ),
      ).toMatchObject({
        type: "response",
        ok: true,
        data: { type: "started" },
      });
    } finally {
      client.socket.close();
      await runs.dispose();
    }
  });
  it("should accept per-agent model overrides when preparing a run and report them in its snapshot", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const server = createDaemonServer({
      daemon: { plugins: { runs } },
      port: 0,
    });
    servers.push(server);
    await server.start();
    const client = await connectSocket(server.url);
    try {
      const prepareId = crypto.randomUUID();
      client.send({
        type: "command",
        requestId: prepareId,
        command: "runs.prepare",
        arguments: {
          runId: "overrides",
          configuration: {
            strategyPath: "example.json",
            cwd: "/work",
          },
        },
      });
      expect(await client.next()).toMatchObject({
        type: "response",
        ok: true,
        data: { runId: "overrides" },
      });
      client.send({
        type: "subscribe",
        requestId: crypto.randomUUID(),
        channel: "runs",
        arguments: { runId: "overrides" },
      });
      expect(await client.next()).toMatchObject({ type: "response", ok: true });
      expect(await client.next()).toMatchObject({
        type: "run.initial",
        data: {
          snapshot: {
            configuration: { cwd: "/work" },
          },
        },
      });
    } finally {
      client.socket.close();
    }
  });
  it("should hydrate one run without waiting for another run's pending writes", async () => {
    const legacy = repository();
    const backing = storageModule.createRunStorage(directories.at(-1)!);
    const saving = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const mock = spyOn(storageModule, "createRunStorage").mockReturnValue({
      ...backing,
      async save(snapshot) {
        if (snapshot.runId === "other" && snapshot.phase === "preparing") {
          saving.resolve();
          await release.promise;
        }
        await backing.save(snapshot);
      },
    });
    const runs = createMockRunsPlugin({
      repository: legacy,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    let preparing: ReturnType<typeof runs.prepareRun> | undefined;
    try {
      await runs.prepareRun({
        runId: "ready",
        configuration: { strategyPath: "example.json" },
      });
      preparing = runs.prepareRun({
        runId: "other",
        configuration: { strategyPath: "example.json" },
      });
      await saving.promise;
      const subscription = await runs.server!.channels![0]!.open(
        { runId: "ready" },
        { signal: new AbortController().signal, send() {}, end() {} },
      );
      expect(subscription?.initial).toMatchObject({
        type: "run.initial",
        data: { snapshot: { runId: "ready", phase: "prepared" } },
      });
      await subscription?.cleanup?.();
    } finally {
      release.resolve();
      await preparing;
      await runs.dispose();
      mock.mockRestore();
    }
  });

  it("should hydrate midway, stream cumulative blocks, finalize the same message and continue on the existing subscription", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const firstChunk = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    runs.registerStrategyHooks({
      name: "hold-first-chunk",
      attach({ strategy }) {
        strategy.agents.writer!.appendHook?.(
          "onStreamEvent",
          async (event: AgentStreamEvent) => {
            if (event.type === "text" && event.text === "first chunk") {
              firstChunk.resolve();
              await release.promise;
            }
          },
        );
      },
    });
    const server = createDaemonServer({
      daemon: { plugins: { runs } },
      port: 0,
    });
    servers.push(server);
    await server.start();
    const first = await connectSocket(server.url);
    try {
      const prepareId = crypto.randomUUID();
      first.send({
        type: "command",
        requestId: prepareId,
        command: "runs.prepare",
        arguments: {
          runId: "shared",
          configuration: {
            strategyPath: "example.json",
          },
        },
      });
      expect(await first.next()).toMatchObject({
        type: "response",
        ok: true,
        data: { runId: "shared" },
      });
      const firstSubscription = crypto.randomUUID();
      first.send({
        type: "subscribe",
        requestId: firstSubscription,
        channel: "runs",
        arguments: { runId: "shared" },
      });
      expect(await first.next()).toMatchObject({ type: "response", ok: true });
      expect(await first.next()).toMatchObject({
        type: "run.initial",
        data: { snapshot: { phase: "prepared" } },
      });
      const startId = crypto.randomUUID();
      first.send({
        type: "command",
        requestId: startId,
        command: "runs.start",
        arguments: { runId: "shared", input: "hello" },
      });
      expect(
        await nextMatching(
          first,
          (message) =>
            message.type === "response" && message.requestId === startId,
        ),
      ).toMatchObject({ ok: true, data: null });
      await firstChunk.promise;
      const second = await connectSocket(server.url);
      const secondSubscription = crypto.randomUUID();
      second.send({
        type: "subscribe",
        requestId: secondSubscription,
        channel: "runs",
        arguments: { runId: "shared" },
      });
      expect(await second.next()).toMatchObject({ type: "response", ok: true });
      const initial = await second.next();
      expect(initial).toMatchObject({
        type: "run.initial",
        data: {
          snapshot: { phase: "running" },
          history: { entries: [{ role: "user" }] },
          pendingInputs: [],
        },
      });
      expect("data" in initial ? initial.data : undefined).not.toHaveProperty(
        "activeMessages",
      );
      const replayedFrame = await second.next();
      const replayed = RunsMessageSchema.parse({
        type: replayedFrame.type,
        data: "data" in replayedFrame ? replayedFrame.data : undefined,
      });
      expect(replayed).toMatchObject({
        type: "agent.stream",
        data: {
          contentIndex: 0,
          content: { type: "text", text: "first chunk" },
        },
      });
      if (replayed.type !== "agent.stream") {
        throw new Error("Expected replayed text");
      }
      const messageId = replayed.data.messageId;
      const savedMessage = join(
        directories.at(-1)!,
        "shared",
        "history",
        `${messageId}.json`,
      );
      expect(existsSync(savedMessage)).toBe(false);
      release.resolve();
      const growing = await nextMatching(
        second,
        (message) => message.type === "agent.stream",
      );
      expect(growing).toMatchObject({
        requestId: secondSubscription,
        data: {
          messageId,
          contentIndex: 0,
          content: { text: "first chunksecond chunk" },
        },
      });
      const completed = await nextMatching(
        second,
        (message) => message.type === "agent.output",
      );
      expect(existsSync(savedMessage)).toBe(true);
      expect(completed).toMatchObject({
        requestId: secondSubscription,
        data: {
          messageId,
          status: "completed",
          content: [{ type: "text", text: "hello" }],
        },
      });
      await nextMatching(
        second,
        (message) =>
          message.type === "run.state" &&
          "data" in message &&
          typeof message.data === "object" &&
          message.data !== null &&
          "phase" in message.data &&
          message.data.phase === "terminal",
      );
      await runs.prepareRun({ runId: "shared" });
      const continuationId = crypto.randomUUID();
      second.send({
        type: "command",
        requestId: continuationId,
        command: "runs.start",
        arguments: { runId: "shared", input: "again" },
      });
      expect(
        await nextMatching(
          second,
          (message) =>
            message.type === "response" && message.requestId === continuationId,
        ),
      ).toMatchObject({ ok: true, data: null });
      expect(
        await nextMatching(
          second,
          (message) => message.type === "agent.output",
        ),
      ).toMatchObject({
        requestId: secondSubscription,
        data: { status: "completed" },
      });
      expect(
        await nextMatching(first, (message) => message.type === "agent.output"),
      ).toMatchObject({ requestId: firstSubscription, data: { messageId } });
      const history = await runs.getHistory("shared");
      expect(history.entries.length).toBe(4);
      expect(
        history.entries.some((entry) => entry.messageId === messageId),
      ).toBe(true);
    } finally {
      release.resolve();
      await runs.dispose();
    }
  });

  it("should acknowledge stop, retain partial output, and keep the subscription open", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const streamed = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    runs.registerStrategyHooks({
      name: "interruptible",
      attach({ strategy, signal }) {
        strategy.agents.writer!.appendHook?.(
          "onStreamEvent",
          async (event: AgentStreamEvent) => {
            if (event.type === "text") {
              streamed.resolve();
              await Promise.race([
                release.promise,
                new Promise<void>((resolve) => {
                  if (signal.aborted) {
                    resolve();
                  } else {
                    signal.addEventListener("abort", () => resolve(), {
                      once: true,
                    });
                  }
                }),
              ]);
              signal.throwIfAborted();
            }
          },
        );
      },
    });
    const server = createDaemonServer({
      daemon: { plugins: { runs } },
      port: 0,
    });
    servers.push(server);
    await server.start();
    try {
      await runs.prepareRun({
        runId: "stoppable",
        configuration: {
          strategyPath: "example.json",
        },
      });
      const client = await connectSocket(server.url);
      const subscriptionId = crypto.randomUUID();
      client.send({
        type: "subscribe",
        requestId: subscriptionId,
        channel: "runs",
        arguments: { runId: "stoppable" },
      });
      await client.next();
      await client.next();
      runs.startRun("stoppable", "hello");
      await streamed.promise;
      const stopId = crypto.randomUUID();
      client.send({
        type: "command",
        requestId: stopId,
        command: "runs.stop",
        arguments: { runId: "stoppable" },
      });
      expect(
        await nextMatching(
          client,
          (message) =>
            message.type === "response" && message.requestId === stopId,
        ),
      ).toMatchObject({ ok: true, data: null });
      expect(
        await nextMatching(
          client,
          (message) => message.type === "agent.output",
        ),
      ).toMatchObject({
        data: { status: "stopped", content: [{ text: "first chunk" }] },
      });
      expect(
        await nextMatching(client, (message) => message.type === "run.state"),
      ).toMatchObject({
        data: { phase: "terminal", outcome: { status: "stopped" } },
      });
      expect((await runs.getHistory("stoppable")).entries.at(-1)).toMatchObject(
        { status: "stopped", content: [{ text: "first chunk" }] },
      );
      client.send({ type: "unsubscribe", requestId: subscriptionId });
      expect(await client.next()).toMatchObject({ type: "response", ok: true });
      expect(await client.next()).toMatchObject({
        type: "subscription_end",
        reason: "unsubscribed",
      });
    } finally {
      release.resolve();
      await runs.dispose();
    }
  });

  it("should keep child messages separate and expose parent launch references", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const parent = await runs.prepareRun({
      runId: "parent",
      configuration: {
        strategyPath: "example.json",
      },
    });
    const messages: unknown[] = [];
    const controller = new AbortController();
    const channel = await runs.server!.channels![0]!.open(
      { runId: parent.runId },
      {
        signal: controller.signal,
        send(message) {
          messages.push(message);
        },
        end() {},
      },
    );
    try {
      await runs.startRun(parent.runId, "child").completion;
      expect(
        messages.filter(
          (message) => RunsMessageSchema.parse(message).type === "child.run",
        ).length,
      ).toBeGreaterThan(0);
      for (const message of messages) {
        const parsed = RunsMessageSchema.parse(message);
        if (parsed.type === "agent.stream" || parsed.type === "agent.output") {
          expect(parsed.data.runId).toBe(parent.runId);
        }
      }
      const history = await runs.getHistory(parent.runId);
      const child = history.entries.find((entry) => entry.type === "child.run");
      if (child?.type !== "child.run") {
        throw new Error("Expected child launch reference");
      }
      expect(history.entries.every((entry) => entry.runId === "parent")).toBe(
        true,
      );
      expect(
        (await runs.getHistory(child.childRunId)).entries.every(
          (entry) => entry.runId === child.childRunId,
        ),
      ).toBe(true);
    } finally {
      controller.abort();
      await channel?.cleanup?.();
      await runs.dispose();
    }
  });

  it("should refuse a launch below the requested maximum depth", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const parent = await runs.prepareRun({
      runId: "depth",
      configuration: { strategyPath: "example.json" },
    });
    try {
      const outcome = await runs.startRun(parent.runId, "limited").completion;
      if (outcome.status !== "completed") {
        throw new Error("Expected completion");
      }
      expect(outcome.summary.text).toContain("Subagent depth limit reached");
    } finally {
      await runs.dispose();
    }
  });

  it("should apply an agent-requested switch when the run next waits for the user", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({
      runId: "agent-switch",
      configuration: { strategyPath: "/work/plan.json" },
    });
    try {
      const switched = new Promise<void>((resolve) => {
        void runs.notifications.subscribe(
          "run_snapshot",
          "agent-switch",
          ({ snapshot }) => {
            if (
              snapshot.phase === RunPhase.prepared &&
              snapshot.strategyState?.revision === 1
            ) {
              resolve();
            }
          },
        );
      });
      expect(
        (await runs.startRun("agent-switch", "switch-me").completion).status,
      ).toBe(RunOutcomeStatus.stopped);
      await switched;
      const snapshot = await runs.getRun("agent-switch");
      expect(snapshot?.configuration.strategyPath).toBe("/work/build.json");
      expect(snapshot?.phase).toBe(RunPhase.prepared);
    } finally {
      await runs.dispose();
    }
  });

  it("should bound server pages while leaving direct plugin history unbounded", () => {
    expect(GetHistoryArgumentsSchema.parse({ runId: "run" }).limit).toBe(25);
    expect(
      GetHistoryArgumentsSchema.safeParse({ runId: "run", limit: 201 }).success,
    ).toBe(false);
    expect(
      GetHistoryArgumentsSchema.safeParse({ runId: "run", limit: 0 }).success,
    ).toBe(false);
  });
  it("should accept one start and correlate pending input answers independently of transport requests", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const commands = new Map(
      runs.server!.commands!.map((command) => [command.name, command]),
    );
    const pending: string[] = [];
    const inputReady = Promise.withResolvers<void>();
    const finished = Promise.withResolvers<void>();
    try {
      await commands.get("runs.prepare")!.invoke({
        runId: "interactive",
        configuration: { strategyPath: "example.json" },
      });
      await runs.notifications.subscribe(
        "run_input_requested",
        "interactive",
        (message) => {
          pending.push(message.inputId);
          if (pending.length === 2) {
            inputReady.resolve();
          }
        },
      );
      await runs.notifications.subscribe(
        "run_snapshot",
        "interactive",
        (message) => {
          if (message.snapshot.phase === "terminal") {
            finished.resolve();
          }
        },
      );
      const starts = await Promise.allSettled([
        commands
          .get("runs.start")!
          .invoke({ runId: "interactive", input: "needs-input" }),
        commands
          .get("runs.start")!
          .invoke({ runId: "interactive", input: "duplicate" }),
      ]);
      expect(starts.map((start) => start.status)).toEqual([
        "fulfilled",
        "rejected",
      ]);
      await inputReady.promise;
      expect(
        await commands.get("runs.get")!.invoke({ runId: "interactive" }),
      ).toMatchObject({ phase: "running" });
      expect(
        await commands.get("runs.get")!.invoke({ runId: "interactive" }),
      ).not.toHaveProperty("conversation");
      await expect(
        commands.get("runs.steer")!.invoke({
          runId: "interactive",
          text: "Review carefully",
          messageId: "stale",
        }),
      ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
      expect(
        await commands.get("runs.resolveInput")!.invoke({
          runId: "interactive",
          inputId: pending[0],
          text: "first answer",
        }),
      ).toBeNull();
      await expect(
        commands.get("runs.resolveInput")!.invoke({
          runId: "interactive",
          inputId: pending[0],
          text: "duplicate",
        }),
      ).rejects.toMatchObject({ code: "INPUT_NOT_FOUND" });
      await commands.get("runs.resolveInput")!.invoke({
        runId: "interactive",
        inputId: pending[1],
        text: "second answer",
      });
      await finished.promise;
      expect(
        await commands
          .get("runs.history")!
          .invoke({ runId: "interactive", limit: 2 }),
      ).toMatchObject({
        entries: [
          { role: "user", content: [{ text: "first answer" }] },
          { role: "user", content: [{ text: "second answer" }] },
        ],
        page: { hasMore: true, before: expect.any(String) },
      });
      expect((await runs.getHistory("interactive")).entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "agent",
            content: [{ type: "text", text: "first answer,second answer" }],
          }),
        ]),
      );
    } finally {
      await runs.dispose();
    }
  });
});
