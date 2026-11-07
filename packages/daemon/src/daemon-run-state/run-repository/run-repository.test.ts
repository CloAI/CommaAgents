import { afterEach, describe, expect, it } from "vitest";
import { appendFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRunRepository } from "./run-repository";

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

describe("createRunRepository", () => {
  it("should persist execution identity separately and remove it when deleting the execution", async () => {
    const store = createRunRepository({ runsDir: TEST_RUNS_DIR });
    expect(await store.getRunIdentity("child")).toBeUndefined();
    await store.saveRunIdentity({ runId: "child", parentRunId: "root" });
    const reopened = createRunRepository({ runsDir: TEST_RUNS_DIR });
    expect(await reopened.getRunIdentity("child")).toEqual({
      runId: "child",
      parentRunId: "root",
    });
    expect(await reopened.getEvents("child")).toEqual([]);
    expect(await reopened.deleteRun("child")).toBe(true);
    expect(await reopened.getRunIdentity("child")).toBeUndefined();
  });

  it("should reject malformed persisted identity", async () => {
    const store = createRunRepository({ runsDir: TEST_RUNS_DIR });
    await store.saveRunIdentity({ runId: "child", parentRunId: "root" });
    writeFileSync(
      join(TEST_RUNS_DIR, "child.identity.json"),
      JSON.stringify({ runId: "other", parentRunId: 42 }),
    );
    await expect(store.getRunIdentity("child")).rejects.toThrow(
      "Invalid run identity",
    );
  });
  it("should append events and load them back", async () => {
    const store = createRunRepository({ runsDir: TEST_RUNS_DIR });
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
    const store = createRunRepository({ runsDir: TEST_RUNS_DIR });
    const events = await store.getEvents("non-existent");
    expect(events).toEqual([]);
  });

  it("should reject malformed history when strict reading is requested", async () => {
    const store = createRunRepository({ runsDir: TEST_RUNS_DIR });
    await store.appendEvent("corrupt", {
      type: "run_started",
      ts: "2026-05-23T10:00:00Z",
      strategyPath: "/test.json",
      strategyName: "Test",
      cwd: "/test/cwd",
    });
    appendFileSync(join(TEST_RUNS_DIR, "corrupt.jsonl"), "{bad json}\n");

    await expect(store.getEvents("corrupt", { strict: true })).rejects.toThrow(
      "Malformed run timeline",
    );
  });

  it("should list runs and synthesize RunOverview correctly", async () => {
    const store = createRunRepository({ runsDir: TEST_RUNS_DIR });

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

  it("should list a continued run from its latest lifecycle segment", async () => {
    const store = createRunRepository({ runsDir: TEST_RUNS_DIR });

    await store.appendEvent("continued-run", {
      type: "run_started",
      ts: "2026-05-23T10:00:00Z",
      strategyPath: "/first.json",
      strategyName: "First",
      cwd: "/first/cwd",
    });
    await store.appendEvent("continued-run", {
      type: "run_completed",
      ts: "2026-05-23T10:01:00Z",
      status: "completed",
    });
    await store.appendEvent("continued-run", {
      type: "run_started",
      ts: "2026-05-23T11:00:00Z",
      strategyPath: "/continued.json",
      strategyName: "Continued",
      cwd: "/continued/cwd",
    });

    expect(await store.listRuns()).toEqual([
      {
        runId: "continued-run",
        strategyPath: "/continued.json",
        strategyName: "Continued",
        cwd: "/continued/cwd",
        startedAt: "2026-05-23T11:00:00Z",
        completedAt: null,
        status: "running",
      },
    ]);
  });

  it("should delete runs successfully", async () => {
    const store = createRunRepository({ runsDir: TEST_RUNS_DIR });
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

  it("should persist and replace run configuration", async () => {
    const store = createRunRepository({ runsDir: TEST_RUNS_DIR });

    await store.saveRunConfig("configured-run", {
      enabledMcpServerIds: ["github", "filesystem"],
    });
    expect(await store.getRunConfig("configured-run")).toEqual({
      enabledMcpServerIds: ["github", "filesystem"],
    });

    await store.saveRunConfig("configured-run", {
      enabledMcpServerIds: ["github"],
    });
    expect(await store.getRunConfig("configured-run")).toEqual({
      enabledMcpServerIds: ["github"],
    });
  });
});
