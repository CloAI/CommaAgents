import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerModel } from "../../../../../core/src/model/model";
import { RunPhase, RunOutcomeStatus } from "../state/state.schemas";
import { createRunsPlugin } from "../runs";
import { cleanupRunFixtures, directories } from "../test.utils";
import * as storageModule from "../state/storage/storage";
import { createSandboxPlugin } from "../../sandbox/sandbox";
import { createQuestionsPlugin } from "../../questions/questions";
import { createLspPlugin } from "../../lsp/lsp";
import { contextMessages } from "./switching.utils";

afterEach(cleanupRunFixtures);

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "strategy-switch-"));
  directories.push(directory);
  const prompts: string[] = [];
  let reject = false;
  registerModel("mock/switch", {
    modelId: "switch",
    specificationVersion: "v3",
    provider: "mock",
    doStream: async (options: unknown) => {
      prompts.push(JSON.stringify(options));
      if (reject) {
        throw new Error("Provider unavailable");
      }
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "text" });
            controller.enqueue({
              type: "text-delta",
              id: "text",
              delta: "Keep the agreed tests.",
            });
            controller.enqueue({ type: "text-end", id: "text" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage: {
                inputTokens: { total: 1 },
                outputTokens: { total: 1 },
              },
            });
            controller.close();
          },
        }),
      };
    },
  } as unknown as Parameters<typeof registerModel>[1]);
  function strategy(name: string, agent: string, waiting = false) {
    const path = join(directory, `${name}.json`);
    writeFileSync(
      path,
      JSON.stringify({
        name,
        version: "1",
        agents: {
          ...(waiting
            ? { user: { type: "user", config: { requireInput: true } } }
            : {}),
          [agent]: { model: "mock/switch" },
        },
        flow: {
          name,
          type: "sequential",
          steps: [
            ...(waiting ? [{ agent: "user" }, { agent: "user" }] : []),
            { agent },
          ],
        },
      }),
    );
    return path;
  }
  const plan = strategy("Plan", "planner");
  const build = strategy("Build", "coder");
  const runsDir = join(directory, "runs");
  return {
    directory,
    runsDir,
    plan,
    build,
    strategy,
    prompts,
    reject: (value: boolean) => {
      reject = value;
    },
    runs: createRunsPlugin({ runsDir }),
  };
}

async function finish(runs: ReturnType<typeof createRunsPlugin>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const snapshot = await runs.getRun("chat");
    if (snapshot?.phase === "terminal") {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Run did not finish");
}

describe("strategy switching", () => {
  it("should stage feature resources without losing the previous prepared scope on failure", async () => {
    const { runs, directory, plan, build } = fixture();
    const sandbox = createSandboxPlugin({ dependencies: { runs } });
    const questions = createQuestionsPlugin({ dependencies: { runs } });
    const lsp = createLspPlugin({ dependencies: { runs } });
    try {
      await runs.prepareRun({
        runId: "chat",
        configuration: { strategyPath: plan, cwd: directory },
      });
      await expect(
        runs.switchStrategy({
          runId: "chat",
          strategyPath: join(directory, "missing.json"),
        }),
      ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
      expect(sandbox.updatePolicy("chat", { mode: "read" }, "read_file")).toBe(
        true,
      );
      await runs.switchStrategy({ runId: "chat", strategyPath: build });
      expect(sandbox.updatePolicy("chat", { mode: "read" }, "read_file")).toBe(
        true,
      );
      await runs.switchStrategy({ runId: "chat", strategyPath: plan });
      expect(sandbox.updatePolicy("chat", { mode: "read" }, "read_file")).toBe(
        true,
      );
      await runs.sendRun({
        runId: "chat",
        input: "Continue with the current services.",
      });
      await finish(runs);
    } finally {
      await runs.dispose();
      await lsp.dispose();
      await questions.dispose();
      await sandbox.dispose();
    }
  });

  it("should cancel a staged replacement before disposing the original run", async () => {
    const { runs, plan, build } = fixture();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    runs.registerRunPreparation({
      name: "held-switch",
      async prepare(scope) {
        if (scope.staged) {
          entered.resolve();
          await release.promise;
        }
        return { strategyInputs: {} };
      },
    });
    try {
      await runs.prepareRun({
        runId: "chat",
        configuration: { strategyPath: plan },
      });
      const switching = runs.switchStrategy({
        runId: "chat",
        strategyPath: build,
      });
      const result = Promise.allSettled([switching]);
      await entered.promise;
      expect(() => runs.startRun("chat", "Competing send")).toThrow(
        "Run is busy",
      );
      const stopping = runs.stopRun("chat");
      release.resolve();
      expect((await result)[0]?.status).toBe("rejected");
      await stopping;
      expect((await runs.getRun("chat"))?.configuration.strategyPath).toBe(
        plan,
      );
      expect((await runs.getRun("chat"))?.phase).toBe(RunPhase.terminal);
      expect((await runs.getHistory("chat")).entries).toHaveLength(0);
    } finally {
      release.resolve();
      await runs.dispose();
    }
  });

  it("should share only attributed visible text and retain repeated messages with different IDs", () => {
    const message = {
      type: "message" as const,
      runId: "chat",
      createdAt: "2026-10-26T12:00:00Z",
      role: "agent" as const,
      agentName: "planner",
      status:
        "stopped" as import("../messages/messages.schemas").RunMessageStatus.stopped,
      content: [
        { type: "text" as const, text: "Keep this." },
        { type: "reasoning" as const, text: "Private reasoning" },
        {
          type: "tool" as const,
          toolCallId: "tool",
          toolName: "read_file",
          arguments: {},
          status:
            "completed" as import("../messages/messages.schemas").RunToolStatus.completed,
          output: "Raw file contents",
        },
      ],
    };
    const projected = contextMessages([
      { ...message, messageId: "first" },
      { ...message, messageId: "first" },
      { ...message, messageId: "second" },
    ]);
    expect(projected).toHaveLength(2);
    expect(projected[0]?.speaker).toBe("planner");
    expect(projected[0]?.text).toBe("[stopped partial response]\nKeep this.");
    expect(JSON.stringify(projected)).not.toContain("Private reasoning");
    expect(JSON.stringify(projected)).not.toContain("Raw file contents");
  });
  it("should pass Plan context to Build and back exactly once, preserving identity and timeline after restart", async () => {
    const { runs, runsDir, plan, build, prompts } = fixture();
    try {
      await runs.prepareRun({
        runId: "chat",
        configuration: { strategyPath: plan },
      });
      await runs.startRun("chat", "Original objective: add strategy switching.")
        .completion;
      const selected = await runs.switchStrategy({
        runId: "chat",
        strategyPath: build,
      });
      expect(selected.runId).toBe("chat");
      expect(selected.phase).toBe(RunPhase.prepared);
      expect(prompts).toHaveLength(1);
      expect(
        await runs.sendRun({ runId: "chat", input: "Implement this." }),
      ).toEqual({ type: "started" });
      await finish(runs);
      expect(prompts[1]).toContain("Original objective");
      expect(prompts[1]).toContain("[planner]");
      expect(prompts[1]).toContain("<strategy_switch from=");
      expect(prompts[1]?.match(/Keep the agreed tests\./g)).toHaveLength(1);
      await runs.switchStrategy({ runId: "chat", strategyPath: plan });
      await runs.sendRun({ runId: "chat", input: "Review the build." });
      await finish(runs);
      expect(prompts[2]?.match(/Original objective/g)).toHaveLength(1);
      expect(prompts[2]).toContain("[coder]");
      await runs.dispose();
      const restarted = createRunsPlugin({ runsDir });
      try {
        expect(
          (await restarted.getRun("chat"))?.configuration.strategyPath,
        ).toBe(plan);
        const history = (await restarted.getHistory("chat")).entries;
        expect(
          history.filter((entry) => entry.type === "strategy.changed"),
        ).toHaveLength(2);
        expect(history.map((entry) => entry.type)).toEqual([
          "message",
          "message",
          "strategy.changed",
          "message",
          "message",
          "strategy.changed",
          "message",
          "message",
        ]);
        await restarted.sendRun({
          runId: "chat",
          input: "Continue reviewing.",
        });
        await finish(restarted);
        expect(prompts[3]?.match(/Original objective/g)).toHaveLength(1);
      } finally {
        await restarted.dispose();
      }
    } finally {
      await runs.dispose();
    }
  });

  it("should keep per-run roles across a strategy switch and let a switch change them", async () => {
    const { runs, plan, build } = fixture();
    try {
      await runs.prepareRun({
        runId: "chat",
        configuration: {
          strategyPath: plan,
          modelRoles: { medium: "mock/switch" },
        },
      });
      const kept = await runs.switchStrategy({
        runId: "chat",
        strategyPath: build,
      });
      expect(kept.configuration.modelRoles).toEqual({ medium: "mock/switch" });
      const changed = await runs.switchStrategy({
        runId: "chat",
        strategyPath: build,
        modelRoles: { simple: "mock/switch" },
      });
      expect(changed.configuration.modelRoles).toEqual({
        medium: "mock/switch",
        simple: "mock/switch",
      });
      const cleared = await runs.switchStrategy({
        runId: "chat",
        strategyPath: build,
        modelRoles: null,
      });
      expect(cleared.configuration.modelRoles).toBeUndefined();
    } finally {
      await runs.dispose();
    }
  });

  it("should reject stale revisions", async () => {
    const { runs, plan, build } = fixture();
    try {
      await runs.prepareRun({
        runId: "chat",
        configuration: { strategyPath: plan },
      });
      await runs.switchStrategy({ runId: "chat", strategyPath: build });
      await expect(
        runs.switchStrategy({
          runId: "chat",
          strategyPath: plan,
          expectedRevision: 0,
        }),
      ).rejects.toMatchObject({ code: "INVALID_RUN_STATE" });
      const updated = await runs.switchStrategy({
        runId: "chat",
        strategyPath: plan,
        expectedRevision: 1,
      });
      expect(updated.strategyState?.changes).toHaveLength(2);
    } finally {
      await runs.dispose();
    }
  });

  it("should require explicit stopping at a human prompt and never start the new strategy automatically", async () => {
    const { runs, strategy, build, prompts } = fixture();
    try {
      await runs.prepareRun({
        runId: "chat",
        configuration: { strategyPath: strategy("Waiting", "planner", true) },
      });
      const waiting = Promise.withResolvers<void>();
      const unsubscribe = await runs.notifications.subscribe(
        "run_input_requested",
        "chat",
        () => waiting.resolve(),
      );
      const execution = runs.startRun("chat", "Make a plan.");
      await waiting.promise;
      await expect(
        runs.switchStrategy({ runId: "chat", strategyPath: build }),
      ).rejects.toMatchObject({ code: "RUN_BUSY" });
      expect((await runs.getRun("chat"))?.strategy?.name).toBe("Waiting");
      await runs.switchStrategy({
        runId: "chat",
        strategyPath: build,
        stop: true,
      });
      expect((await execution.completion).status).toBe(
        RunOutcomeStatus.stopped,
      );
      expect((await runs.getRun("chat"))?.phase).toBe(RunPhase.prepared);
      expect(prompts).toHaveLength(0);
      unsubscribe();
    } finally {
      await runs.dispose();
    }
  });

  it("should leave the prior prepared strategy and timeline intact after loading or persistence fails", async () => {
    const { runs, directory, plan, build } = fixture();
    try {
      await runs.prepareRun({
        runId: "chat",
        configuration: { strategyPath: plan },
      });
      await expect(
        runs.switchStrategy({
          runId: "chat",
          strategyPath: join(directory, "missing.json"),
        }),
      ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
      expect((await runs.getRun("chat"))?.configuration.strategyPath).toBe(
        plan,
      );
      expect((await runs.getRun("chat"))?.phase).toBe(RunPhase.prepared);
      expect((await runs.getHistory("chat")).entries).toHaveLength(0);
      await runs.startRun("chat", "Still usable.").completion;
      // Inject only the replacement document write; the original document remains authoritative.
      const originalFactory = storageModule.createRunStorage;
      const mock = vi.spyOn(storageModule, "createRunStorage").mockImplementation(
        (runsDir) => {
          const backing = originalFactory(runsDir);
          return {
            ...backing,
            save: async (snapshot) => {
              if (snapshot.configuration.strategyPath === build) {
                throw new Error("Disk full");
              }
              await backing.save(snapshot);
            },
          };
        },
      );
      const other = createRunsPlugin({ runsDir: join(directory, "runs") });
      try {
        await expect(
          other.switchStrategy({ runId: "chat", strategyPath: build }),
        ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
        expect((await other.getRun("chat"))?.configuration.strategyPath).toBe(
          plan,
        );
        expect(
          (await other.getHistory("chat")).entries.some(
            (entry) => entry.type === "strategy.changed",
          ),
        ).toBe(false);
      } finally {
        mock.mockRestore();
        await other.dispose();
      }
    } finally {
      await runs.dispose();
    }
  });

  it("should ask before an oversized handoff and send recent messages without erasing display history", async () => {
    const { runs, plan, build, prompts } = fixture();
    try {
      const original = "Older detail ".repeat(12_000);
      await runs.prepareRun({
        runId: "chat",
        configuration: { strategyPath: plan },
      });
      await runs.startRun("chat", original).completion;
      await runs.switchStrategy({ runId: "chat", strategyPath: build });
      const choice = await runs.sendRun({ runId: "chat", input: "Implement." });
      expect(choice.type).toBe("context_required");
      expect(prompts).toHaveLength(1);
      expect(choice).toMatchObject({ recentCount: 1 });
      expect(
        await runs.sendRun({
          runId: "chat",
          input: "Implement.",
          contextChoice: "recent",
        }),
      ).toEqual({ type: "started" });
      await finish(runs);
      expect(prompts[1]).not.toContain("Older detail");
      expect(prompts[1]).toContain("Keep the agreed tests");
      expect(JSON.stringify((await runs.getHistory("chat")).entries)).toContain(
        original,
      );
    } finally {
      await runs.dispose();
    }
  });

  it("should compact with core and retain the compacted context across continuation", async () => {
    const { runs, plan, build, prompts } = fixture();
    try {
      await runs.prepareRun({
        runId: "chat",
        configuration: { strategyPath: plan },
      });
      await runs.startRun("chat", "Long prior discussion ".repeat(7000))
        .completion;
      await runs.switchStrategy({ runId: "chat", strategyPath: build });
      expect(
        await runs.sendRun({
          runId: "chat",
          input: "Implement.",
          contextChoice: "compact",
        }),
      ).toEqual({ type: "started" });
      await finish(runs);
      expect(prompts.length).toBeGreaterThan(2);
      expect(prompts.at(-1)).not.toContain("Long prior discussion");
      expect(
        (await runs.getRun("chat"))?.strategyState?.handoff.messages.some(
          (message) => message.speaker === "conversation summary",
        ),
      ).toBe(true);
      await runs.sendRun({ runId: "chat", input: "Continue." });
      await finish(runs);
      expect(prompts.at(-1)).not.toContain("Long prior discussion");
      await runs.switchStrategy({ runId: "chat", strategyPath: plan });
      await runs.sendRun({
        runId: "chat",
        input: "Continue after switching back.",
      });
      await finish(runs);
      expect(prompts.at(-1)).not.toContain("Long prior discussion");
    } finally {
      await runs.dispose();
    }
  });

  it("should surface execution errors without context choices and display retried input once", async () => {
    const setup = fixture();
    const { runs, plan, build } = setup;
    try {
      await runs.prepareRun({
        runId: "chat",
        configuration: { strategyPath: plan },
      });
      await runs.startRun("chat", "Original discussion.").completion;
      await runs.switchStrategy({ runId: "chat", strategyPath: build });
      setup.reject(true);
      for (const contextChoice of [undefined, "full"] as const) {
        await expect(
          runs.sendRun({ runId: "chat", input: "Implement.", contextChoice }),
        ).rejects.toMatchObject({ code: "EXECUTION_ERROR" });
      }
      setup.reject(false);
      expect(
        await runs.sendRun({
          runId: "chat",
          input: "Implement.",
          contextChoice: "recent",
        }),
      ).toEqual({ type: "started" });
      await finish(runs);
      expect(setup.prompts.at(-1)?.match(/Implement\./g)).toHaveLength(1);
      const inputs = (await runs.getHistory("chat")).entries.filter(
        (entry) =>
          entry.type === "message" &&
          entry.role === "user" &&
          entry.content.some((block) => block.text === "Implement."),
      );
      expect(inputs).toHaveLength(1);
    } finally {
      await runs.dispose();
    }
  });
});
