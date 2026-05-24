import { afterEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "../logger/logger.types";
import { createRunStore } from "./runs";
import { markStaleRunsAsInterrupted } from "./runs.utils";

const TEST_RUNS_DIR = join(
  "/tmp",
  `comma-agents-runs-utils-test-${Math.random().toString(36).slice(2)}`,
);

const silentLogger: Logger = {
  child: () => silentLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  close: async () => {},
};

afterEach(() => {
  try {
    rmSync(TEST_RUNS_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("markStaleRunsAsInterrupted", () => {
  it("should mark `running` runs as cancelled with INTERRUPTED error", async () => {
    const runStore = createRunStore({ runsDir: TEST_RUNS_DIR });
    await runStore.appendEvent("stale-running", {
      type: "run_started",
      ts: new Date().toISOString(),
      cwd: "/tmp",
      strategyName: "test",
      strategyPath: "/tmp/test.json",
    });

    const interruptedCount = await markStaleRunsAsInterrupted(
      runStore,
      silentLogger,
    );

    expect(interruptedCount).toBe(1);
    const events = await runStore.getEvents("stale-running");
    const completed = events.find((ev) => ev.type === "run_completed");
    expect(completed).toBeDefined();
    expect(completed?.type).toBe("run_completed");
    if (completed && completed.type === "run_completed") {
      expect(completed.status).toBe("cancelled");
      expect(completed.error?.code).toBe("INTERRUPTED");
    }
  });

  it("should leave completed/cancelled/error runs untouched", async () => {
    const runStore = createRunStore({ runsDir: TEST_RUNS_DIR });

    for (const terminalStatus of ["completed", "cancelled", "error"] as const) {
      await runStore.appendEvent(`terminal-${terminalStatus}`, {
        type: "run_started",
        ts: new Date().toISOString(),
        cwd: "/tmp",
        strategyName: "test",
        strategyPath: "/tmp/test.json",
      });
      await runStore.appendEvent(`terminal-${terminalStatus}`, {
        type: "run_completed",
        ts: new Date().toISOString(),
        status: terminalStatus,
      });
    }

    const interruptedCount = await markStaleRunsAsInterrupted(
      runStore,
      silentLogger,
    );

    expect(interruptedCount).toBe(0);
  });

  it("should return 0 when there are no runs", async () => {
    const runStore = createRunStore({ runsDir: TEST_RUNS_DIR });
    const interruptedCount = await markStaleRunsAsInterrupted(
      runStore,
      silentLogger,
    );
    expect(interruptedCount).toBe(0);
  });
});
