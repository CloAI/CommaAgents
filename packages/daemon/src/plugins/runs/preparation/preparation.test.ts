import { afterEach, describe, expect, test } from "bun:test";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  fakeLoader,
  repository,
} from "../test.utils";

import type { StrategyLoaderInputs } from "../runs.types";

afterEach(cleanupRunFixtures);

describe("run preparation", () => {
  test("uses changed strategy settings as defaults for later continuations", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({
      runId: "settings-1",
      strategyPath: "first.json",
      cwd: "/first",
    });
    await runs.startRun("settings-1", "first").completion;
    await runs.prepareRun({
      runId: "settings-1",
      strategyPath: "second.json",
      cwd: "/second",
    });
    await runs.continueRun("settings-1", "second").completion;
    const prepared = await runs.prepareRun({ runId: "settings-1" });
    expect(prepared.phase).toBe("prepared");
    if (prepared.phase === "prepared") {
      expect(prepared.strategyPath).toBe("second.json");
      expect(prepared.cwd).toBe("/second");
    }
    await runs.stopRun("settings-1");
  });

  test("coalesces matching preparation and cancels it before a timeline starts", async () => {
    const storage = repository();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: (() => void) | undefined;
    const providerEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const runs = createMockRunsPlugin({
      repository: storage,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const cleanup: string[] = [];
    runs.registerRunPreparation({
      name: "slow",
      async prepare() {
        entered?.();
        await gate;
        return {
          dispose: () => {
            cleanup.push("slow");
          },
        };
      },
    });
    const first = runs.prepareRun({
      runId: "pending-1",
      strategyPath: "example.json",
    });
    const updates: string[] = [];
    await runs.notifications.subscribe(
      "run_preparation_cancelled",
      "pending-1",
      (update) => {
        updates.push(update.type);
      },
    );
    const second = runs.prepareRun({
      runId: "pending-1",
      strategyPath: "example.json",
    });
    expect(first).toBe(second);
    expect(() =>
      runs.prepareRun({
        runId: "pending-1",
        strategyPath: "other.json",
      }),
    ).toThrow("Conflicting preparation");
    await providerEntered;
    const stopped = runs.stopRun("pending-1");
    release?.();
    expect((await first).phase).toBe("cancelled");
    await stopped;
    expect(cleanup).toEqual(["slow"]);
    expect(updates).toContain("run_preparation_cancelled");
    expect(await storage.getEvents("pending-1")).toEqual([]);
  });

  test("rejects overlapping loader inputs and cleans providers in reverse order", async () => {
    const storage = repository();
    const runs = createMockRunsPlugin({
      repository: storage,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const cleanup: string[] = [];
    for (const name of ["first", "second"]) {
      runs.registerRunPreparation({
        name,
        prepare() {
          return {
            strategyInputs: {
              sandbox: {} as NonNullable<StrategyLoaderInputs["sandbox"]>,
            },
            dispose: () => {
              cleanup.push(name);
            },
          };
        },
      });
    }
    await expect(
      runs.prepareRun({
        runId: "collision-1",
        strategyPath: "example.json",
      }),
    ).rejects.toThrow("both provide sandbox");
    expect(cleanup).toEqual(["second", "first"]);
    expect(await storage.getEvents("collision-1")).toEqual([]);
  });

  test("combines collection inputs from providers for the same agent", async () => {
    let supplied: Partial<StrategyLoaderInputs> | undefined;
    const loader = fakeLoader({ loads: [], restored: [] });
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy(options) {
        supplied = options.strategyInputs;
        return loader(options);
      },
    });
    runs.registerRunPreparation({
      name: "first",
      prepare: () => ({
        strategyInputs: {
          mcpToolsByAgent: {
            writer: { tools: { alpha: {} as never }, origins: {} },
          },
        },
      }),
    });
    runs.registerRunPreparation({
      name: "second",
      prepare: () => ({
        strategyInputs: {
          mcpToolsByAgent: {
            writer: { tools: { beta: {} as never }, origins: {} },
          },
        },
      }),
    });
    await runs.prepareRun({ runId: "merged-1", strategyPath: "example.json" });
    expect(Object.keys(supplied?.mcpToolsByAgent?.writer?.tools ?? {})).toEqual(
      ["alpha", "beta"],
    );
    await runs.stopRun("merged-1");
  });

  test("marks an unfinished persisted segment interrupted and can continue it", async () => {
    const storage = repository();
    await storage.appendEvent("interrupted-1", {
      type: "run_started",
      ts: new Date().toISOString(),
      strategyPath: "example.json",
      strategyName: "example",
      cwd: process.cwd(),
      initialInput: "previous input",
    });
    const observed = { loads: [] as string[], restored: [] as string[][] };
    const runs = createMockRunsPlugin({
      repository: storage,
      loadStrategy: fakeLoader(observed),
    });
    expect((await runs.getRun("interrupted-1"))?.outcome?.status).toBe(
      "interrupted",
    );
    const prepared = await runs.prepareRun({ runId: "interrupted-1" });
    expect(prepared.phase).toBe("prepared");
    expect(
      (await runs.continueRun("interrupted-1", "next").completion).status,
    ).toBe("completed");
    expect(
      (await storage.getEvents("interrupted-1")).filter(
        (event) => event.type === "run_started",
      ),
    ).toHaveLength(2);
  });

  test("should allow feature registration after preparation", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    expect(runs).not.toHaveProperty("closeRegistration");
    await runs.prepareRun({
      runId: "registration",
      strategyPath: "example.json",
    });
    expect(() =>
      runs.registerRunPreparation({ name: "late", prepare: () => ({}) }),
    ).not.toThrow();
    expect(() =>
      runs.registerStrategyHooks({ name: "late", attach() {} }),
    ).not.toThrow();
    await runs.dispose();
  });
});
