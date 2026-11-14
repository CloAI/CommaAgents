import type { LoadedStrategy } from "@comma-agents/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPlugin } from "../../../daemon-plugin";
import type { RunNotifications } from "../runs.notifications";
import type { PrepareRunResult } from "../runs.types";
import { RunPhase, RunOutcomeStatus } from "./state.schemas";
import {
  createRunEntry,
  createRunsContext,
  getRunSnapshot,
  setMcpServerOverride,
} from "./state";
import { getDisplayHistory } from "../history/history";
import { stopRun } from "../execution/execution";
import { createRunsPlugin } from "../runs";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  createRunDirectory,
} from "../test.utils";
afterEach(cleanupRunFixtures);
describe("run observation", () => {
  it("should keep direct notification subscriptions future-only across restart", async () => {
    const runs = createMockRunsPlugin({
      runsDir: createRunDirectory(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({
      runId: "saved",
      configuration: { strategyPath: "example.json" },
    });
    await runs.startRun("saved", "answer").completion;
    await runs.dispose();
    const restarted = createRunsPlugin({ runsDir: directories.at(-1)! });
    const snapshots: unknown[] = [];
    await restarted.notifications.subscribe(
      "run_snapshot",
      "saved",
      (event) => {
        snapshots.push(event);
      },
    );
    expect(snapshots).toEqual([]);
    expect(await restarted.getRun("saved")).toMatchObject({
      phase: "terminal",
      outcome: { status: "completed" },
    });
    expect(snapshots).toEqual([]);
    await restarted.dispose();
  });
  it("should isolate throwing listeners and stop delivery after unsubscribe", async () => {
    const runs = createMockRunsPlugin({
      runsDir: createRunDirectory(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({
      runId: "listeners",
      configuration: { strategyPath: "example.json" },
    });
    await runs.notifications.subscribe("run_snapshot", "listeners", () => {
      throw new Error("Listener failure");
    });
    const removed: unknown[] = [];
    const unsubscribe = await runs.notifications.subscribe(
      "run_snapshot",
      "listeners",
      (event) => {
        removed.push(event);
      },
    );
    unsubscribe();
    await runs.startRun("listeners", "answer").completion;
    expect(removed).toEqual([]);
    await runs.dispose();
  });
  it("should deliver final stopped state during disposal and reject new subscriptions", async () => {
    const runs = createMockRunsPlugin({
      runsDir: createRunDirectory(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({
      runId: "dispose",
      configuration: { strategyPath: "example.json" },
    });
    const snapshots: unknown[] = [];
    await runs.notifications.subscribe("run_snapshot", "dispose", (event) => {
      snapshots.push(event.snapshot);
    });
    const disposal = runs.dispose();
    await expect(
      runs.notifications.subscribe("run_snapshot", "dispose", () => {}),
    ).rejects.toThrow("disposing");
    await disposal;
    expect(snapshots).toMatchObject([
      { phase: "terminal", outcome: { status: "stopped" } },
    ]);
  });
});

describe("active runs", () => {
  it("should list only running runs", async () => {
    const runs = createMockRunsPlugin({
      runsDir: createRunDirectory(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({
      runId: "listed",
      configuration: { strategyPath: "example.json" },
    });
    expect(runs.listActiveRuns()).toEqual([]);

    const inputs: string[] = [];
    const ready = Promise.withResolvers<void>();
    await runs.notifications.subscribe(
      "run_input_requested",
      "listed",
      ({ inputId }) => {
        inputs.push(inputId);
        if (inputs.length === 2) {
          ready.resolve();
        }
      },
    );
    const execution = runs.startRun("listed", "needs-input");
    await ready.promise;
    expect(runs.listActiveRuns()).toEqual([{ runId: "listed" }]);

    await runs.resolveInput("listed", inputs[0]!, "one");
    await runs.resolveInput("listed", inputs[1]!, "two");
    await execution.completion;
    expect(runs.listActiveRuns()).toEqual([]);
    await runs.dispose();
  });
});
describe("saved run reads", () => {
  it("should allow concurrent reads without allocating a runtime, restoring conversation, or rewriting saved state", async () => {
    createRunDirectory();
    const { notifications } = createPlugin<"runs", RunNotifications>({
      name: "runs",
      notifications: true,
      cleanup: async () => {},
    });
    const context = createRunsContext(
      { runsDir: directories.at(-1)! },
      notifications,
    );
    await context.storage.save({
      runId: "archived",
      configuration: { strategyPath: "example.json", cwd: "/workspace" },
      strategy: null,
      phase: RunPhase.preparing,
    });
    const path = join(directories.at(-1)!, "archived", "run.json");
    const original = readFileSync(path, "utf8");
    const saving = vi.spyOn(context.storage, "save");
    const restoring = vi.spyOn(context.storage, "conversation");
    try {
      const snapshots = await Promise.all([
        getRunSnapshot(context, "archived"),
        getRunSnapshot(context, "archived"),
      ]);
      for (const snapshot of snapshots) {
        expect(snapshot).toMatchObject({
          runId: "archived",
          phase: "terminal",
          outcome: { status: "interrupted" },
        });
      }
      expect(await getDisplayHistory(context, "archived")).toMatchObject({
        entries: [],
      });
      await stopRun(context, "archived");
      expect(context.runs.size).toBe(0);
      expect(saving).not.toHaveBeenCalled();
      expect(restoring).not.toHaveBeenCalled();
      expect(readFileSync(path, "utf8")).toBe(original);
    } finally {
      saving.mockRestore();
      restoring.mockRestore();
    }
  });

  it("should return a runtime created while an older saved snapshot was loading", async () => {
    createRunDirectory();
    const { notifications } = createPlugin<"runs", RunNotifications>({
      name: "runs",
      notifications: true,
      cleanup: async () => {},
    });
    const context = createRunsContext(
      { runsDir: directories.at(-1)! },
      notifications,
    );
    const saved = {
      runId: "loading",
      configuration: { strategyPath: "example.json", cwd: "/workspace" },
      strategy: null,
      phase: RunPhase.terminal as const,
      outcome: { status: RunOutcomeStatus.stopped as const },
    };
    await context.storage.save(saved);
    const read = context.storage.read;
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const reading = vi
      .spyOn(context.storage, "read")
      .mockImplementationOnce(async (runId) => {
        const snapshot = await read(runId);
        entered.resolve();
        await release.promise;
        return snapshot;
      });
    try {
      const snapshot = getRunSnapshot(context, saved.runId);
      await entered.promise;
      const preparation = Promise.withResolvers<PrepareRunResult>();
      const entry = createRunEntry(saved, saved.configuration, {
        phase: RunPhase.preparing,
        preparation: preparation.promise,
      });
      context.runs.set(saved.runId, entry);
      release.resolve();
      expect(await snapshot).toMatchObject({
        runId: saved.runId,
        phase: "preparing",
      });
      expect(context.runs.get(saved.runId)).toBe(entry);
    } finally {
      release.resolve();
      reading.mockRestore();
    }
  });
});

describe("MCP run configuration", () => {
  it("should keep the saved and in-memory configuration when an override write fails", async () => {
    createRunDirectory();
    const { notifications } = createPlugin<"runs", RunNotifications>({
      name: "runs",
      notifications: true,
      cleanup: async () => {},
    });
    const context = createRunsContext(
      { runsDir: directories.at(-1)! },
      notifications,
    );
    const entry = createRunEntry(
      { runId: "root" },
      {
        strategyPath: "example.json",
        cwd: "/workspace",
        modelRoles: { default: "openai/test" },
      },
      {
        phase: RunPhase.terminal,
        outcome: { status: RunOutcomeStatus.stopped },
      },
    );
    context.runs.set("root", entry);
    const previous = entry.configuration;
    await context.storage.save({
      runId: "root",
      configuration: previous,
      strategy: null,
      phase: RunPhase.terminal,
      outcome: { status: RunOutcomeStatus.stopped },
    });
    vi.spyOn(context.storage, "save").mockRejectedValueOnce(
      new Error("disk unavailable"),
    );
    await expect(
      setMcpServerOverride(context, "root", "docs", false),
    ).rejects.toMatchObject({ code: "PERSISTENCE_ERROR" });
    expect(entry.configuration).toBe(previous);
    expect((await context.storage.read("root"))?.configuration).toEqual(
      previous,
    );
    expect(context.operations.size).toBe(0);
  });
  it("should not release execution finalization's reservation when a settings write completes", async () => {
    createRunDirectory();
    const { notifications } = createPlugin<"runs", RunNotifications>({
      name: "runs",
      notifications: true,
      cleanup: async () => {},
    });
    const context = createRunsContext(
      { runsDir: directories.at(-1)! },
      notifications,
    );
    const entry = createRunEntry(
      { runId: "running" },
      { strategyPath: "example.json", cwd: "/workspace" },
      {
        phase: RunPhase.running,
        strategy: {} as LoadedStrategy,
        completion: Promise.resolve({ status: RunOutcomeStatus.stopped }),
      },
    );
    entry.description = {
      name: "Test",
      agents: ["writer"],
      flow: { name: "Main", type: "sequential", steps: [{ agent: "writer" }] },
    };
    context.runs.set(entry.runId, entry);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const save = context.storage.save;
    vi.spyOn(context.storage, "save").mockImplementationOnce(
      async (snapshot) => {
        entered.resolve();
        await release.promise;
        await save(snapshot);
      },
    );
    const changing = setMcpServerOverride(context, entry.runId, "docs", false);
    await entered.promise;
    expect(context.operations.has(entry.runId)).toBe(false);
    // Execution reserves its terminal checkpoint while the configuration write is pending.
    context.operations.add(entry.runId);
    entry.state = {
      phase: RunPhase.terminal,
      outcome: { status: RunOutcomeStatus.stopped },
    };
    release.resolve();
    await changing;
    expect(context.operations.has(entry.runId)).toBe(true);
    expect(entry.configuration.mcpServerOverrides).toEqual({ docs: false });
    context.operations.delete(entry.runId);
  });
});
