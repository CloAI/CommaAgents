import { afterEach, describe, expect, test } from "bun:test";
import type { RunStatus } from "../runs.notifications";
import { createRunsPlugin } from "../runs";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  fakeLoader,
  repository,
  directories,
} from "../test.utils";

afterEach(cleanupRunFixtures);

describe("run observation", () => {
  test("should require explicit snapshot hydration after restart and notify only future changes", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({ runId: "persisted", strategyPath: "example.json" });
    await runs.startRun("persisted", "saved answer").completion;
    await runs.dispose();
    const restarted = createRunsPlugin({ runsDir: directories.at(-1)! });
    const snapshots: RunStatus[] = [];
    await restarted.notifications.subscribe(
      "run_snapshot",
      "persisted",
      (event) => {
        snapshots.push(event);
      },
    );
    expect(snapshots).toEqual([]);
    expect(() => restarted.getRunLineage("persisted")).toThrow(
      "Missing run identity",
    );
    expect(await restarted.getRun("persisted")).toMatchObject({
      phase: "terminal",
      outcome: { status: "completed", summary: { text: "saved answer" } },
    });
    expect(snapshots).toEqual([]);
    await restarted.dispose();
  });

  test("should deliver cleanup notifications and reject new subscriptions when disposal begins", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({ runId: "dispose", strategyPath: "example.json" });
    const cancelled: string[] = [];
    await runs.notifications.subscribe(
      "run_preparation_cancelled",
      "dispose",
      (event) => {
        cancelled.push(event.runId);
      },
    );
    const disposal = runs.dispose();
    await expect(
      runs.notifications.subscribe("run_snapshot", "dispose", () => {}),
    ).rejects.toThrow("disposing");
    await disposal;
    expect(cancelled).toEqual(["dispose"]);
    await expect(
      runs.notifications.subscribe("run_snapshot", "dispose", () => {}),
    ).rejects.toThrow("disposed");
  });

  test("should deliver future snapshots and isolate throwing listeners", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({ runId: "listeners", strategyPath: "example.json" });
    await runs.notifications.subscribe("run_snapshot", "listeners", () => {
      throw new Error("listener failed");
    });
    const updates: RunStatus[] = [];
    await runs.notifications.subscribe(
      "run_snapshot",
      "listeners",
      (update) => {
        updates.push(update);
      },
    );
    await runs.notifications.subscribe(
      "run_agent_output",
      "listeners",
      (update) => {
        updates.push(update);
      },
    );
    expect(updates).toEqual([]);
    expect((await runs.startRun("listeners", "answer").completion).status).toBe(
      "completed",
    );
    expect(
      updates.filter((update) => update.type === "run_agent_output"),
    ).toHaveLength(1);
    expect(updates.at(-1)).toMatchObject({
      type: "run_snapshot",
      snapshot: { phase: "terminal" },
    });
  });

  test("should stop delivering to an unsubscribed listener", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({
      runId: "unsubscribe",
      strategyPath: "example.json",
    });
    const removedUpdates: RunStatus[] = [];
    const activeUpdates: RunStatus[] = [];
    const unsubscribe = await runs.notifications.subscribe(
      "run_agent_stream",
      "unsubscribe",
      (update) => {
        removedUpdates.push(update);
      },
    );
    await runs.notifications.subscribe(
      "run_agent_stream",
      "unsubscribe",
      (update) => {
        activeUpdates.push(update);
      },
    );
    unsubscribe();
    unsubscribe();
    await runs.startRun("unsubscribe", "answer").completion;
    expect(removedUpdates).toHaveLength(0);
    expect(
      activeUpdates.filter((update) => update.type === "run_agent_stream"),
    ).toHaveLength(3);
  });

  test("should stream live deltas and wait for persistence before notifying completed output", async () => {
    const storage = repository();
    const recordWriteStarted = Promise.withResolvers<void>();
    const allowRecordWrite = Promise.withResolvers<void>();
    const runs = createMockRunsPlugin({
      repository: {
        ...storage,
        async appendEvent(runId, event) {
          if (event.type === "agent_call") {
            recordWriteStarted.resolve();
            await allowRecordWrite.promise;
          }
          await storage.appendEvent(runId, event);
        },
      },
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({ runId: "ordering", strategyPath: "example.json" });
    const updates: RunStatus[] = [];
    const observedHistoryReads: Array<ReturnType<typeof storage.getEvents>> =
      [];
    await runs.notifications.subscribe("run_snapshot", "ordering", (update) => {
      updates.push(update);
    });
    await runs.notifications.subscribe(
      "run_agent_stream",
      "ordering",
      (update) => {
        updates.push(update);
      },
    );
    await runs.notifications.subscribe(
      "run_agent_output",
      "ordering",
      (update) => {
        updates.push(update);
        if (update.type === "run_agent_output")
          observedHistoryReads.push(storage.getEvents("ordering"));
      },
    );
    const execution = runs.startRun("ordering", "answer");
    await recordWriteStarted.promise;
    expect(
      updates.filter((update) => update.type === "run_agent_stream"),
    ).toHaveLength(2);
    expect(updates.some((update) => update.type === "run_agent_output")).toBe(
      false,
    );
    const lateUpdates: RunStatus[] = [];
    await runs.notifications.subscribe("run_snapshot", "ordering", (update) => {
      lateUpdates.push(update);
    });
    await runs.notifications.subscribe(
      "run_agent_stream",
      "ordering",
      (update) => {
        lateUpdates.push(update);
      },
    );
    expect(lateUpdates).toEqual([]);
    allowRecordWrite.resolve();
    await execution.completion;
    const historyAtOutput = await observedHistoryReads[0];
    expect(historyAtOutput?.at(-1)?.type).toBe("agent_call");
    expect(
      lateUpdates.filter((update) => update.type === "run_agent_stream"),
    ).toMatchObject([{ event: { type: "done" } }]);
    expect(updates.at(-1)).toMatchObject({
      type: "run_snapshot",
      snapshot: {
        phase: "terminal",
        outcome: { status: "completed", summary: { text: "answer" } },
      },
    });
  });
});
