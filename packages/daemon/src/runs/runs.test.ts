import { afterEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { createRunStore } from "./runs";

const TEST_RUNS_DIR = join(
  "/tmp",
  `comma-agents-runs-test-${Math.random().toString(36).slice(2)}`,
);

afterEach(() => {
  try {
    rmSync(TEST_RUNS_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("JSONL Timeline RunStore", () => {
  it("should append events and load them back", async () => {
    const store = createRunStore({ runsDir: TEST_RUNS_DIR });
    const runId = "test-run-1";

    await store.appendEvent(runId, {
      type: "run_started",
      ts: "2026-05-23T10:00:00Z",
      strategyPath: "/test.json",
      strategyName: "Test",
      cwd: "/test/cwd",
    });

    await store.appendEvent(runId, {
      type: "run_completed",
      ts: "2026-05-23T10:01:00Z",
      status: "completed",
    });

    const events = await store.getEvents(runId);
    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe("run_started");
    expect(events[1]?.type).toBe("run_completed");
  });

  it("should return empty array for non-existent run", async () => {
    const store = createRunStore({ runsDir: TEST_RUNS_DIR });
    const events = await store.getEvents("non-existent");
    expect(events).toEqual([]);
  });

  it("should list runs and synthesize RunOverview correctly", async () => {
    const store = createRunStore({ runsDir: TEST_RUNS_DIR });

    // Run 1: completed
    await store.appendEvent("run-1", {
      type: "run_started",
      ts: "2026-05-23T10:00:00Z",
      strategyPath: "/test.json",
      strategyName: "Test 1",
      cwd: "/test/cwd",
    });
    await store.appendEvent("run-1", {
      type: "run_completed",
      ts: "2026-05-23T10:01:00Z",
      status: "completed",
    });

    // Run 2: running (no completed event)
    await store.appendEvent("run-2", {
      type: "run_started",
      ts: "2026-05-23T10:02:00Z",
      strategyPath: "/test.json",
      strategyName: "Test 2",
      cwd: "/test/cwd",
    });

    const list = await store.listRuns();
    expect(list.length).toBe(2);

    const first = list[0]!; // sorted by startedAt desc, so run-2 is first
    expect(first.runId).toBe("run-2");
    expect(first.status).toBe("running");
    expect(first.completedAt).toBeNull();

    const second = list[1]!;
    expect(second.runId).toBe("run-1");
    expect(second.status).toBe("completed");
    expect(second.completedAt).toBe("2026-05-23T10:01:00Z");
  });

  it("should delete runs successfully", async () => {
    const store = createRunStore({ runsDir: TEST_RUNS_DIR });
    const runId = "test-delete";

    await store.appendEvent(runId, {
      type: "run_started",
      ts: "2026-05-23T10:00:00Z",
      strategyPath: "/test.json",
      strategyName: "Test",
      cwd: "/test/cwd",
    });

    expect(await store.getEvents(runId)).not.toEqual([]);
    const deleted = await store.deleteRun(runId);
    expect(deleted).toBe(true);
    expect(await store.getEvents(runId)).toEqual([]);
  });
});
