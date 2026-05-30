import { afterEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { createRunStore } from "../runs";
import { createDaemonState } from "../state/state";
import {
  mockLogger,
  mockSink,
  setupMockModels,
  writeTempStrategy,
} from "../test.utils";
import { createStrategyExecutor } from "./executor";

const TEST_RUNS_DIR = join(
  "/tmp",
  `comma-agents-resume-executor-test-${Math.random().toString(36).slice(2)}`,
);

const tempFiles: string[] = [];

afterEach(() => {
  try {
    rmSync(TEST_RUNS_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
  for (const f of tempFiles) {
    try {
      rmSync(f, { force: true });
    } catch {
      // Ignore
    }
  }
  tempFiles.length = 0;
});

const RESUME_TEST_STRATEGY = JSON.stringify({
  name: "ResumeTest",
  version: "1.0",
  agents: {
    user: { type: "user", config: { requireInput: true } },
    assistant: { model: "openai/gpt-4o" },
  },
  flow: {
    name: "SequentialResume",
    type: "sequential",
    steps: [{ agent: "assistant" }, { agent: "user" }],
  },
});

describe("StrategyExecutor Resume", () => {
  it("should resume a cancelled run from its timeline events and wait on input again", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();
    const runStore = createRunStore({ runsDir: TEST_RUNS_DIR });

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
      runStore,
    });

    const filePath = await writeTempStrategy(RESUME_TEST_STRATEGY);
    tempFiles.push(filePath);

    // 1. Start strategy. The first step is assistant (completes instantly),
    // then user runs which blocks for input because we pass empty string as initial input.
    const runId = executor.startRun("client-1", filePath, "");

    // Wait for the input request to be broadcasted
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Confirm we are waiting on input
    expect(
      sink.broadcasts.some((b) => b.message.type === "request_input"),
    ).toBe(true);

    // 2. Stop/abort the run. This transition status to cancelled.
    executor.stopRun(runId);

    // Confirm it's cancelled in state
    const run = state.getRun(runId);
    expect(run?.status).toBe("cancelled");

    // 3. Clear our sink broadcasts so we have a clean slate to count resume events
    sink.broadcasts.length = 0;

    // 4. Resume the run!
    executor.resumeRun("client-1", runId);

    // Wait for the flow to execute and replay back to the user agent step
    await new Promise((resolve) => setTimeout(resolve, 250));
    console.log("RESUME BROADCASTS:", JSON.stringify(sink.broadcasts, null, 2));

    // The resumed run should have successfully re-started and blocked on input again!
    expect(
      sink.broadcasts.some((b) => b.message.type === "strategy_started"),
    ).toBe(true);
    expect(
      sink.broadcasts.some((b) => b.message.type === "request_input"),
    ).toBe(true);

    // And the run should be in "running" state in memory!
    const resumedRun = state.getRun(runId);
    expect(resumedRun?.status).toBe("running");
  });
});
