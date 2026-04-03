// Tests for the strategy executor — main orchestration layer.
//
// These tests use mock providers, mock sinks, and inline strategy content
// written to temp files. The executor is tested end-to-end with the core
// loadStrategyFromString pipeline.

import { afterEach, describe, expect, it } from "bun:test";
import { extractProviderIds } from "@comma-agents/core";
import { createDaemonState } from "../state/state";
import {
  MINIMAL_STRATEGY,
  MULTI_AGENT_STRATEGY,
  mockCredentialStore,
  mockLogger,
  mockProviderResolver,
  mockSink,
  USER_AGENT_STRATEGY,
  waitForBroadcasts,
  writeTempStrategy,
} from "../test.utils";
import { createStrategyExecutor } from "./executor";

// Track temp files for cleanup
const tempFiles: string[] = [];

afterEach(async () => {
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

  it("extracts provider ID from defaults.model", () => {
    const raw = {
      defaults: { model: "google/gemini-pro" },
      agents: { a1: { useDefaults: true } },
    };
    const ids = extractProviderIds(raw);
    expect(ids).toEqual(new Set(["google"]));
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
    const state = createDaemonState();
    const sink = mockSink();
    const store = mockCredentialStore({
      openai: { type: "api", key: "sk-test" },
    });

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
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
    const state = createDaemonState();
    const sink = mockSink();
    const store = mockCredentialStore({
      openai: { type: "api", key: "sk-test" },
    });

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
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

  it("broadcasts flow_started with strategy metadata", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    const store = mockCredentialStore({
      openai: { type: "api", key: "sk-test" },
    });

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    executor.startRun("client-1", filePath, "hello");

    // Wait for flow_started broadcast
    await waitForBroadcasts(sink, 1);

    const flowStarted = sink.broadcasts.find((b) => b.message.type === "flow_started");
    expect(flowStarted).toBeDefined();
    if (flowStarted && flowStarted.message.type === "flow_started") {
      expect(flowStarted.message.strategyName).toBe("Test");
      expect(flowStarted.message.agents).toContain("assistant");
    }
  });

  it("broadcasts step_started and step_completed for each step", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    const store = mockCredentialStore({
      openai: { type: "api", key: "sk-test" },
    });

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    executor.startRun("client-1", filePath, "hello");

    // Wait for flow_completed (which means all steps have run)
    await waitForBroadcasts(sink, 4, 10000);

    const types = sink.broadcasts.map((b) => b.message.type);
    expect(types).toContain("step_started");
    expect(types).toContain("step_completed");
  });

  it("broadcasts flow_completed on success", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    const store = mockCredentialStore({
      openai: { type: "api", key: "sk-test" },
    });

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const runId = executor.startRun("client-1", filePath, "hello");

    // Wait for flow_completed
    await waitForBroadcasts(sink, 4, 10000);

    const flowCompleted = sink.broadcasts.find((b) => b.message.type === "flow_completed");
    expect(flowCompleted).toBeDefined();
    if (flowCompleted && flowCompleted.message.type === "flow_completed") {
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

  it("broadcasts flow_error when strategy file is invalid", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    const store = mockCredentialStore();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
    });

    const filePath = await writeTempStrategy("{ invalid json content");
    tempFiles.push(filePath);

    const runId = executor.startRun("client-1", filePath, "hello");

    // Wait for flow_error broadcast
    await waitForBroadcasts(sink, 1, 5000);

    const flowError = sink.broadcasts.find((b) => b.message.type === "flow_error");
    expect(flowError).toBeDefined();
    if (flowError && flowError.message.type === "flow_error") {
      expect(flowError.message.runId).toBe(runId);
      expect(flowError.message.error.code).toBe("EXECUTION_ERROR");
    }

    // State should be "error"
    const run = state.getRun(runId);
    expect(run?.status).toBe("error");
  });

  it("broadcasts flow_error when strategy file is not found", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    const store = mockCredentialStore();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
    });

    const runId = executor.startRun("client-1", "/nonexistent/path/strategy.json", "hello");

    await waitForBroadcasts(sink, 1, 5000);

    const flowError = sink.broadcasts.find((b) => b.message.type === "flow_error");
    expect(flowError).toBeDefined();
    if (flowError && flowError.message.type === "flow_error") {
      expect(flowError.message.runId).toBe(runId);
      expect(flowError.message.error.message).toContain("not found");
    }
  });

  it("stopRun aborts execution and broadcasts flow_error with CANCELLED", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    const store = mockCredentialStore({
      openai: { type: "api", key: "sk-test" },
    });

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
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

    // Should have broadcast a flow_error with CANCELLED
    const cancelledMsg = sink.broadcasts.find(
      (b) => b.message.type === "flow_error" && b.message.error.code === "CANCELLED",
    );
    expect(cancelledMsg).toBeDefined();
  });

  it("handleUserInput routes to the correct run's input bridge", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    const store = mockCredentialStore({
      openai: { type: "api", key: "sk-test" },
    });

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
    });

    const filePath = await writeTempStrategy(USER_AGENT_STRATEGY);
    tempFiles.push(filePath);

    const runId = executor.startRun("client-1", filePath, "hello");

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

    // Wait for flow_completed
    await waitForBroadcasts(sink, 6, 10000);

    const flowCompleted = sink.broadcasts.find((b) => b.message.type === "flow_completed");
    expect(flowCompleted).toBeDefined();
  });

  it("handleUserInput returns false for unknown run", () => {
    const state = createDaemonState();
    const sink = mockSink();
    const store = mockCredentialStore();

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
    });

    expect(executor.handleUserInput("nonexistent", "agent", "text")).toBe(false);
  });

  it("broadcasts flow_error when no credential exists for a provider", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    // No pre-configured credentials — core's auto-resolve will fail
    const store = mockCredentialStore();

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const runId = executor.startRun("client-1", filePath, "hello");

    // Wait for flow_error broadcast (credential resolution fails)
    await waitForBroadcasts(sink, 1, 5000);

    const flowError = sink.broadcasts.find((b) => b.message.type === "flow_error");
    expect(flowError).toBeDefined();
    if (flowError && flowError.message.type === "flow_error") {
      expect(flowError.message.runId).toBe(runId);
      expect(flowError.message.error.code).toBe("EXECUTION_ERROR");
    }

    // State should be "error"
    const run = state.getRun(runId);
    expect(run?.status).toBe("error");
  });

  it("multi-agent strategy broadcasts events for each step", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    const store = mockCredentialStore({
      openai: { type: "api", key: "sk-test" },
      anthropic: { type: "api", key: "sk-ant-test" },
    });

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
    });

    const filePath = await writeTempStrategy(MULTI_AGENT_STRATEGY);
    tempFiles.push(filePath);

    executor.startRun("client-1", filePath, "hello");

    // Wait for flow_completed (1 flow_started + 2 step_started + 2 step_completed + agent events + flow_completed)
    await waitForBroadcasts(sink, 6, 10000);

    const types = sink.broadcasts.map((b) => b.message.type);

    // Should have flow_started
    expect(types).toContain("flow_started");
    // Should have step events for both agents
    expect(types.filter((t) => t === "step_started").length).toBeGreaterThanOrEqual(2);
    expect(types.filter((t) => t === "step_completed").length).toBeGreaterThanOrEqual(2);
    // Should have flow_completed
    expect(types).toContain("flow_completed");
  });

  it("requestId is echoed in flow_started and flow_completed", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    const store = mockCredentialStore({
      openai: { type: "api", key: "sk-test" },
    });

    state.addClient("client-1");

    const executor = createStrategyExecutor({
      state,
      sink,
      credentialStore: store,
      logger: mockLogger(),
      providerResolver: mockProviderResolver(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    executor.startRun("client-1", filePath, "hello", "req-123");

    await waitForBroadcasts(sink, 4, 10000);

    const flowStarted = sink.broadcasts.find((b) => b.message.type === "flow_started");
    const flowCompleted = sink.broadcasts.find((b) => b.message.type === "flow_completed");

    expect(flowStarted?.message.requestId).toBe("req-123");
    expect(flowCompleted?.message.requestId).toBe("req-123");
  });
});
