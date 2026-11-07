import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPlugin } from "../../../daemon-plugin";
import type { RunNotifications } from "../runs.notifications";
import type { PrepareRunResult } from "../runs.types";
import { RunPhase, RunOutcomeStatus } from "./state.schemas";
import { createRunEntry, createRunsContext, getRunSnapshot } from "./state";
import { getDisplayHistory } from "../history/history";
import { stopRun } from "../execution/execution";
import { createRunsPlugin } from "../runs";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  repository,
} from "../test.utils";
afterEach(cleanupRunFixtures);
describe("run observation", () => {
  it("should keep direct notification subscriptions future-only across restart", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
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
      repository: repository(),
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
      repository: repository(),
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

describe("saved run reads", () => {
  it("should allow concurrent reads without allocating a runtime, restoring conversation, or rewriting saved state", async () => {
    repository();
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
    repository();
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
    const reading = vi.spyOn(context.storage, "read").mockImplementationOnce(
      async (runId) => {
        const snapshot = await read(runId);
        entered.resolve();
        await release.promise;
        return snapshot;
      },
    );
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
