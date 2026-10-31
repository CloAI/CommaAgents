import { RunPhase } from "../state/state.schemas";
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  fakeLoader,
  directories,
  repository,
} from "../test.utils";
import { RunErrorCode } from "../errors";
import * as storageModule from "../state/storage/storage";
afterEach(cleanupRunFixtures);
describe("run preparation", () => {
  it("should reserve preparation until its successful configuration is durable", async () => {
    const legacy = repository();
    const backing = storageModule.createRunStorage(directories.at(-1)!);
    const saving = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const mock = spyOn(storageModule, "createRunStorage").mockReturnValue({
      ...backing,
      async save(snapshot) {
        if (snapshot.phase === RunPhase.prepared) {
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
    try {
      const preparing = runs.prepareRun({
        runId: "durable-preparation",
        configuration: { strategyPath: "example.json" },
      });
      await saving.promise;
      expect(await runs.getRun("durable-preparation")).toMatchObject({
        phase: "preparing",
        strategy: null,
      });
      expect(() => runs.startRun("durable-preparation")).toThrow("Run is busy");
      const stopping = runs.stopRun("durable-preparation");
      release.resolve();
      expect(await preparing).toMatchObject({
        phase: "terminal",
        outcome: { status: "stopped" },
      });
      await stopping;
    } finally {
      release.resolve();
      await runs.dispose();
      mock.mockRestore();
    }
  });

  it("should allow reads during saved-run preparation while rejecting a second preparation", async () => {
    const legacy = repository();
    const original = createMockRunsPlugin({
      repository: legacy,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await original.prepareRun({
      runId: "shared",
      configuration: { strategyPath: "example.json" },
    });
    await original.startRun("shared", "saved answer").completion;
    await original.dispose();
    const observed = { loads: [] as string[], restored: [] as string[][] };
    const runs = createMockRunsPlugin({
      repository: legacy,
      loadStrategy: fakeLoader(observed),
    });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let acquired = 0;
    runs.registerRunPreparation({
      name: "held-resource",
      async prepare() {
        acquired++;
        entered.resolve();
        await release.promise;
        return { strategyInputs: {} };
      },
    });
    const attempts = Promise.allSettled([
      runs.prepareRun({ runId: "shared" }),
      runs.prepareRun({ runId: "shared" }),
    ]);
    try {
      await entered.promise;
      const snapshots = await Promise.all([
        runs.getRun("shared"),
        runs.getRun("shared"),
      ]);
      expect(
        snapshots.every((snapshot) => snapshot?.phase === RunPhase.preparing),
      ).toBe(true);
      expect((await runs.getHistory("shared")).entries).toHaveLength(2);
      release.resolve();
      const results = await attempts;
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { code: RunErrorCode.RUN_BUSY } });
      expect(acquired).toBe(1);
      expect(observed.loads).toEqual(["shared"]);
    } finally {
      release.resolve();
      await attempts;
      await runs.dispose();
    }
  });

  it("should keep per-agent model overrides until they are cleared", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const prepared = await runs.prepareRun({
      runId: "agents",
      configuration: {
        strategyPath: "example.json",
        modelOverrides: { planner: "openai/gpt-4o" },
      },
    });
    expect(prepared.configuration.modelOverrides).toEqual({
      planner: "openai/gpt-4o",
    });
    await runs.startRun("agents", "go").completion;
    const kept = await runs.prepareRun({ runId: "agents" });
    expect(kept.configuration.modelOverrides).toEqual({
      planner: "openai/gpt-4o",
    });
    await runs.startRun("agents", "again").completion;
    const cleared = await runs.prepareRun({
      runId: "agents",
      configuration: { modelOverrides: null },
    });
    expect(cleared.configuration.modelOverrides).toBeUndefined();
    await runs.dispose();
  });
  it("should resolve saved settings and allow clearing optional overrides", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({
      runId: "settings",
      configuration: {
        strategyPath: "first.json",
        cwd: "/first",
        manifestPath: "project.json",
        modelOverride: "first/model",
      },
    });
    await runs.startRun("settings", "first").completion;
    const changed = await runs.prepareRun({
      runId: "settings",
      configuration: { cwd: "/second", modelOverride: null },
    });
    expect(changed.configuration).toEqual({
      strategyPath: "first.json",
      cwd: "/second",
      manifestPath: "project.json",
      modelOverride: undefined,
    });
    expect(changed).not.toHaveProperty("mode");
    expect(changed).not.toHaveProperty("conversation");
    await runs.startRun("settings", "second").completion;
    expect(
      (await runs.prepareRun({ runId: "settings" })).configuration.cwd,
    ).toBe("/second");
    await runs.dispose();
  });
  it("should reject competing preparation and retain stopped state with no loaded strategy", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    const cleanup: string[] = [];
    runs.registerRunPreparation({
      name: "slow",
      async prepare() {
        entered.resolve();
        await gate.promise;
        return {
          strategyInputs: {},
          dispose() {
            cleanup.push("slow");
          },
        };
      },
    });
    const preparation = runs.prepareRun({
      runId: "pending",
      configuration: { strategyPath: "example.json" },
    });
    await entered.promise;
    await expect(runs.prepareRun({ runId: "pending" })).rejects.toMatchObject({
      code: RunErrorCode.RUN_BUSY,
    });
    const stopping = runs.stopRun("pending");
    gate.resolve();
    expect(await preparation).toMatchObject({
      phase: "terminal",
      strategy: null,
      outcome: { status: "stopped" },
    });
    await stopping;
    expect(cleanup).toEqual(["slow"]);
    expect(await runs.getRun("pending")).toMatchObject({
      phase: "terminal",
      outcome: { status: "stopped" },
    });
    await runs.dispose();
  });
  it("should keep last successful configuration after replacement preparation fails", async () => {
    const loader = fakeLoader({ loads: [], restored: [] });
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy(options) {
        if (options.strategyPath === "broken.json") {
          throw new Error("External diagnostic should not be persisted");
        }
        return loader(options);
      },
    });
    await runs.prepareRun({
      runId: "rollback",
      configuration: { strategyPath: "good.json" },
    });
    await runs.stopRun("rollback");
    await expect(
      runs.prepareRun({
        runId: "rollback",
        configuration: { strategyPath: "broken.json" },
      }),
    ).rejects.toMatchObject({ code: RunErrorCode.PREPARATION_ERROR });
    const snapshot = await runs.getRun("rollback");
    expect(snapshot).toMatchObject({
      configuration: { strategyPath: "good.json" },
      strategy: { name: "example" },
      phase: "terminal",
      outcome: {
        status: "failed",
        error: {
          code: RunErrorCode.PREPARATION_ERROR,
          metadata: { runId: "rollback" },
        },
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain("External diagnostic");
    await runs.dispose();
  });
  it("should release providers in reverse order when loader inputs conflict", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const cleanup: string[] = [];
    for (const name of ["first", "second"]) {
      runs.registerRunPreparation({
        name,
        prepare() {
          return {
            strategyInputs: { sandbox: {} as never },
            dispose() {
              cleanup.push(name);
            },
          };
        },
      });
    }
    await expect(
      runs.prepareRun({ configuration: { strategyPath: "example.json" } }),
    ).rejects.toMatchObject({ code: RunErrorCode.PREPARATION_ERROR });
    expect(cleanup).toEqual(["second", "first"]);
    await runs.dispose();
  });
  it("should keep matched provider services and allow resource-free preparation", async () => {
    let supplied: string[] = [];
    const loader = fakeLoader({ loads: [], restored: [] });
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy(options) {
        supplied = Object.keys(
          options.strategyInputs.mcpToolsByAgent?.writer?.tools ?? {},
        );
        return loader(options);
      },
    });
    for (const name of ["alpha", "beta"]) {
      runs.registerRunPreparation({
        name,
        prepare: () => ({
          strategyInputs: {
            mcpToolsByAgent: {
              writer: { tools: { [name]: {} as never }, origins: {} },
            },
          },
        }),
      });
    }
    const prepared = await runs.prepareRun({
      configuration: { strategyPath: "example.json" },
    });
    expect(supplied).toEqual(["alpha", "beta"]);
    runs.registerStrategyHooks({ name: "later", attach() {} });
    expect(prepared.phase).toBe(RunPhase.prepared);
    await runs.dispose();
  });
});

describe("optional agent instrumentation", () => {
  it("should allow lightweight agents while omitting unsupported per-agent observation", async () => {
    const loader = fakeLoader({ loads: [], restored: [] });
    const runs = createMockRunsPlugin({
      repository: repository(),
      async loadStrategy(options) {
        const strategy = await loader(options);
        delete strategy.agents.writer!.appendHook;
        delete strategy.agents.writer!.getConversationContext;
        return strategy;
      },
    });
    const prepared = await runs.prepareRun({
      configuration: { strategyPath: "example.json" },
    });
    expect(
      await runs.startRun(prepared.runId, "answer").completion,
    ).toMatchObject({ status: "completed", summary: { text: "answer" } });
    expect(
      (await runs.getHistory(prepared.runId)).entries.every(
        (message) => message.type !== "message" || message.role !== "agent",
      ),
    ).toBe(true);
    await runs.dispose();
  });
});
