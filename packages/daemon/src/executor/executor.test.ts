// Tests for the strategy executor — main orchestration layer.
//
// These tests use mock models registered via registerMockModel(),
// mock sinks, and inline strategy content written to temp files.
// The executor is tested end-to-end with the core loadStrategyFromString
// pipeline. Model and credential resolution happen via global registries.

import { afterEach, describe, expect, it } from "bun:test";
import { extractProviderIds, resetGlobalDefaults, resetModelRegistry } from "@comma-agents/core";
import { createDaemonState } from "../state/state";
import {
  MINIMAL_STRATEGY,
  MULTI_AGENT_STRATEGY,
  mockLogger,
  mockSink,
  mockSessionStore,
  setupMockModels,
  USER_AGENT_STRATEGY,
  waitForBroadcasts,
  writeTempStrategy,
} from "../test.utils";
import { createStrategyExecutor } from "./executor";

// Track temp files for cleanup
const tempFiles: string[] = [];

afterEach(async () => {
  // Clean up global registries
  resetModelRegistry();
  resetGlobalDefaults();

  // Clean up temp files
  for (const f of tempFiles) {
    try {
      await Bun.write(f, ""); // Overwrite to empty
    } catch {
      // Ignore cleanup errors
    }
  }
  tempFiles.length = 0;
});

// extractProviderIds tests

describe("extractProviderIds", () => {
  it("extracts provider IDs from agent model strings", () => {
    const raw = {
      agents: {
        a1: { model: "openai/gpt-4o" },
        a2: { model: "anthropic/claude-3.5-sonnet" },
      },
    };
    const ids = extractProviderIds(raw);
    expect(ids).toEqual(new Set(["openai", "anthropic"]));
  });

  it("deduplicates provider IDs", () => {
    const raw = {
      agents: {
        a1: { model: "openai/gpt-4o" },
        a2: { model: "openai/gpt-3.5-turbo" },
      },
    };
    const ids = extractProviderIds(raw);
    expect(ids).toEqual(new Set(["openai"]));
    expect(ids.size).toBe(1);
  });

  it("skips agents without model strings (user agents)", () => {
    const raw = {
      agents: {
        user: { type: "user" },
        assistant: { model: "openai/gpt-4o" },
      },
    };
    const ids = extractProviderIds(raw);
    expect(ids).toEqual(new Set(["openai"]));
  });

  it("returns empty set for no models", () => {
    const raw = {
      agents: {
        user: { type: "user" },
      },
    };
    const ids = extractProviderIds(raw);
    expect(ids.size).toBe(0);
  });
});

// createStrategyExecutor tests

describe("createStrategyExecutor", () => {
  it("startRun creates a run in state, subscribes client, and returns runId", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const runId = executor.startRun("client-1", filePath, "hello");

    // Run ID should be returned immediately
    expect(runId).toBeDefined();
    expect(typeof runId).toBe("string");

    // Run should exist in state
    const run = state.getRun(runId);
    expect(run).toBeDefined();
    expect(run?.strategyPath).toBe(filePath);

    // Client should be subscribed
    const subs = state.getSubscriptions("client-1");
    expect(subs).toContain(runId);
  });

  it("fire-and-forget: startRun returns before execution completes", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const runId = executor.startRun("client-1", filePath, "hello");

    // At this point, the run is pending — execution hasn't completed yet
    const run = state.getRun(runId);
    expect(run).toBeDefined();
    // Status is either "pending" or "running" (depending on timing)
    expect(["pending", "running"]).toContain(run?.status);
  });

  it("broadcasts strategy_started with strategy metadata", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    executor.startRun("client-1", filePath, "hello");

    // Wait for strategy_started broadcast
    await waitForBroadcasts(sink, 1);

    const flowStarted = sink.broadcasts.find((b) => b.message.type === "strategy_started");
    expect(flowStarted).toBeDefined();
    if (flowStarted && flowStarted.message.type === "strategy_started") {
      expect(flowStarted.message.strategyName).toBe("Test");
      expect(flowStarted.message.agents).toContain("assistant");
    }
  });

  it("broadcasts step_started and step_completed for each step", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    executor.startRun("client-1", filePath, "hello");

    // Wait for strategy_completed (which means all steps have run)
    await waitForBroadcasts(sink, 4, 10000);

    const types = sink.broadcasts.map((b) => b.message.type);
    expect(types).toContain("step_started");
    expect(types).toContain("step_completed");
  });

  it("broadcasts strategy_completed on success", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const runId = executor.startRun("client-1", filePath, "hello");

    // Wait for strategy_completed
    await waitForBroadcasts(sink, 4, 10000);

    const flowCompleted = sink.broadcasts.find((b) => b.message.type === "strategy_completed");
    expect(flowCompleted).toBeDefined();
    if (flowCompleted && flowCompleted.message.type === "strategy_completed") {
      expect(flowCompleted.message.runId).toBe(runId);
      expect(typeof flowCompleted.message.result).toBe("string");
      expect(flowCompleted.message.usage).toBeDefined();
    }

    // State should be updated to completed
    const run = state.getRun(runId);
    expect(run?.status).toBe("completed");
    expect(run?.completedAt).toBeDefined();
    expect(run?.result).toBeDefined();
  });

  it("broadcasts strategy_error when strategy file is invalid", async () => {
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    const filePath = await writeTempStrategy("{ invalid json content");
    tempFiles.push(filePath);

    const runId = executor.startRun("client-1", filePath, "hello");

    // Wait for strategy_error broadcast
    await waitForBroadcasts(sink, 1, 5000);

    const flowError = sink.broadcasts.find((b) => b.message.type === "strategy_error");
    expect(flowError).toBeDefined();
    if (flowError && flowError.message.type === "strategy_error") {
      expect(flowError.message.runId).toBe(runId);
      expect(flowError.message.error.code).toBe("EXECUTION_ERROR");
    }

    // State should be "error"
    const run = state.getRun(runId);
    expect(run?.status).toBe("error");
  });

  it("broadcasts strategy_error when strategy file is not found", async () => {
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    const runId = executor.startRun("client-1", "/nonexistent/path/strategy.json", "hello");

    await waitForBroadcasts(sink, 1, 5000);

    const flowError = sink.broadcasts.find((b) => b.message.type === "strategy_error");
    expect(flowError).toBeDefined();
    if (flowError && flowError.message.type === "strategy_error") {
      expect(flowError.message.runId).toBe(runId);
      expect(flowError.message.error.message).toContain("not found");
    }
  });

  it("stopRun aborts execution and broadcasts strategy_error with CANCELLED", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const runId = executor.startRun("client-1", filePath, "hello");

    // Stop immediately
    executor.stopRun(runId);

    // State should be cancelled
    const run = state.getRun(runId);
    expect(run?.status).toBe("cancelled");
    expect(run?.error?.code).toBe("CANCELLED");

    // Should have broadcast a strategy_error with CANCELLED
    const cancelledMsg = sink.broadcasts.find(
      (b) => b.message.type === "strategy_error" && b.message.error.code === "CANCELLED",
    );
    expect(cancelledMsg).toBeDefined();
  });

  it("handleUserInput routes to the correct run's input bridge", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    const filePath = await writeTempStrategy(USER_AGENT_STRATEGY);
    tempFiles.push(filePath);

    // Pass empty input so the first user-agent step routes through the input
    // bridge (instead of being satisfied by the executor's first-input seed).
    const runId = executor.startRun("client-1", filePath, "");

    // Wait for request_input broadcast
    await waitForBroadcasts(sink, 2, 10000);

    const requestInput = sink.broadcasts.find((b) => b.message.type === "request_input");
    expect(requestInput).toBeDefined();

    if (requestInput && requestInput.message.type === "request_input") {
      // Route user_input to the bridge
      const handled = executor.handleUserInput(
        runId,
        requestInput.message.agentName,
        "user response text",
      );
      expect(handled).toBe(true);
    }

    // Wait for strategy_completed
    await waitForBroadcasts(sink, 6, 10000);

    const flowCompleted = sink.broadcasts.find((b) => b.message.type === "strategy_completed");
    expect(flowCompleted).toBeDefined();
  });

  it("handleUserInput returns false for unknown run", () => {
    const state = createDaemonState();
    const sink = mockSink();

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    expect(executor.handleUserInput("nonexistent", "agent", "text")).toBe(false);
  });

  it("broadcasts strategy_error when no model is registered for a provider", async () => {
    // No mock models registered — model resolution will fail at call time
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const runId = executor.startRun("client-1", filePath, "hello");

    // Wait for strategy_error broadcast (model resolution fails)
    await waitForBroadcasts(sink, 1, 5000);

    const flowError = sink.broadcasts.find((b) => b.message.type === "strategy_error");
    expect(flowError).toBeDefined();
    if (flowError && flowError.message.type === "strategy_error") {
      expect(flowError.message.runId).toBe(runId);
      expect(flowError.message.error.code).toBe("EXECUTION_ERROR");
    }

    // State should be "error"
    const run = state.getRun(runId);
    expect(run?.status).toBe("error");
  });

  it("multi-agent strategy broadcasts events for each step", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    const filePath = await writeTempStrategy(MULTI_AGENT_STRATEGY);
    tempFiles.push(filePath);

    executor.startRun("client-1", filePath, "hello");

    // Wait for strategy_completed (1 strategy_started + 2 step_started + 2 step_completed + agent events + strategy_completed)
    await waitForBroadcasts(sink, 6, 10000);

    const types = sink.broadcasts.map((b) => b.message.type);

    // Should have strategy_started
    expect(types).toContain("strategy_started");
    // Should have step events for both agents
    expect(types.filter((t) => t === "step_started").length).toBeGreaterThanOrEqual(2);
    expect(types.filter((t) => t === "step_completed").length).toBeGreaterThanOrEqual(2);
    // Should have strategy_completed
    expect(types).toContain("strategy_completed");
  });

  it("requestId is echoed in strategy_started and strategy_completed", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      logger: mockLogger(),
    sessionStore: mockSessionStore(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    executor.startRun("client-1", filePath, "hello", "req-123");

    await waitForBroadcasts(sink, 4, 10000);

    const flowStarted = sink.broadcasts.find((b) => b.message.type === "strategy_started");
    const flowCompleted = sink.broadcasts.find((b) => b.message.type === "strategy_completed");

    expect(flowStarted?.message.requestId).toBe("req-123");
    expect(flowCompleted?.message.requestId).toBe("req-123");
  });
});
