// Tests for the strategy executor — main orchestration layer.
//
// These tests use mock providers, mock sinks, and inline strategy content
// written to temp files. The executor is tested end-to-end with the core
// loadStrategyFromString pipeline.

import { afterEach, describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderFactory } from "@comma-agents/core";
import type { LanguageModel } from "ai";

import type { CredentialStore } from "../credentials/types";
import type { Logger } from "../logger/types";
import type { DaemonMessage } from "../protocol/daemon";
import type { Credential } from "../protocol/shared";
import { createDaemonState } from "../state/state";
import type { EventSink } from "./event-sink";
import type { ProviderResolver } from "./executor";
import { createStrategyExecutor, extractProviderIds } from "./executor";

// Helpers

/** Create a mock LanguageModel that returns a fixed response. */
function createMockModel(id: string): LanguageModel {
  return {
    modelId: id,
    specificationVersion: "v3",
    provider: "mock",
    defaultObjectGenerationMode: undefined,
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: `response from ${id}` }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: {
          total: 10,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 20, text: undefined, reasoning: undefined },
      },
      warnings: [],
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(c) {
          c.close();
        },
      }),
    }),
  } as unknown as LanguageModel;
}

/** Create a ProviderFactory from a mock model. */
function mockProviderFactory(providerName: string): ProviderFactory {
  return (modelID: string) => createMockModel(`${providerName}/${modelID}`);
}

/** Mock EventSink that records messages. */
function mockSink(): EventSink & {
  broadcasts: Array<{ runId: string; message: DaemonMessage }>;
  sends: Array<{ clientId: string; message: DaemonMessage }>;
} {
  const broadcasts: Array<{ runId: string; message: DaemonMessage }> = [];
  const sends: Array<{ clientId: string; message: DaemonMessage }> = [];
  return {
    broadcasts,
    sends,
    broadcast(runId: string, message: DaemonMessage) {
      broadcasts.push({ runId, message });
    },
    send(clientId: string, message: DaemonMessage) {
      sends.push({ clientId, message });
    },
  };
}

/** Mock CredentialStore that returns pre-configured credentials. */
function mockCredentialStore(credentials: Record<string, Credential> = {}): CredentialStore & {
  setCalls: Array<{ providerId: string; scope: string; credential: Credential }>;
} {
  const setCalls: Array<{
    providerId: string;
    scope: string;
    credential: Credential;
  }> = [];

  return {
    setCalls,
    async resolve(providerId: string) {
      return credentials[providerId];
    },
    async get() {
      return undefined;
    },
    async set(providerId: string, scope: string, credential: Credential) {
      setCalls.push({ providerId, scope, credential });
    },
    async remove() {
      return false;
    },
    async list() {
      return [];
    },
    async listScopes() {
      return [];
    },
  };
}

/** Mock Logger that silently discards messages. */
function mockLogger(): Logger {
  const noop = () => {};
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child() {
      return mockLogger();
    },
    flush: noop,
    close: noop,
  };
}

/** Mock ProviderResolver that creates mock ProviderFactory from credentials. */
function mockProviderResolver(): ProviderResolver {
  return (providerId: string, _credential: Credential) => {
    return mockProviderFactory(providerId);
  };
}

/** Write a strategy JSON string to a temp file and return the path. */
async function writeTempStrategy(content: string, ext: string = "json"): Promise<string> {
  const filename = `test-strategy-${crypto.randomUUID()}.${ext}`;
  const filePath = join(tmpdir(), filename);
  await Bun.write(filePath, content);
  return filePath;
}

/** Wait for broadcasts to accumulate, with a maximum wait time. */
async function waitForBroadcasts(
  sink: ReturnType<typeof mockSink>,
  count: number,
  timeoutMs: number = 5000,
): Promise<void> {
  const start = Date.now();
  while (sink.broadcasts.length < count) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${count} broadcasts (got ${sink.broadcasts.length})`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

// Minimal strategy: single agent, sequential flow
const MINIMAL_STRATEGY = JSON.stringify({
  name: "Test",
  version: "1.0",
  agents: {
    assistant: { model: "openai/gpt-4o" },
  },
  flow: {
    name: "Main",
    type: "sequential",
    steps: [{ agent: "assistant" }],
  },
});

// Multi-agent strategy
const MULTI_AGENT_STRATEGY = JSON.stringify({
  name: "MultiAgent",
  version: "1.0",
  agents: {
    writer: { model: "openai/gpt-4o", systemPrompt: "You write code." },
    reviewer: { model: "anthropic/claude-3.5-sonnet", systemPrompt: "You review code." },
  },
  flow: {
    name: "Review",
    type: "sequential",
    steps: [{ agent: "writer" }, { agent: "reviewer" }],
  },
});

// Strategy with a user agent
const USER_AGENT_STRATEGY = JSON.stringify({
  name: "WithUser",
  version: "1.0",
  agents: {
    user: { type: "user", config: { requireInput: true } },
    assistant: { model: "openai/gpt-4o" },
  },
  flow: {
    name: "Chat",
    type: "sequential",
    steps: [{ agent: "user" }, { agent: "assistant" }],
  },
});

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
    expect(run!.strategyPath).toBe(filePath);

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
    expect(["pending", "running"]).toContain(run!.status);
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
    expect(run!.status).toBe("completed");
    expect(run!.completedAt).toBeDefined();
    expect(run!.result).toBeDefined();
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
    expect(run!.status).toBe("error");
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
    expect(run!.status).toBe("cancelled");
    expect(run!.error?.code).toBe("CANCELLED");

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

  it("handleProvideAuth resolves auth bridge and returns true", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    // No pre-configured credentials — will trigger auth bridge
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

    // Wait for request_auth to be sent to the client
    const waitStart = Date.now();
    while (sink.sends.length === 0) {
      if (Date.now() - waitStart > 5000) {
        throw new Error("Timed out waiting for request_auth");
      }
      await new Promise((r) => setTimeout(r, 10));
    }

    const requestAuth = sink.sends.find((s) => s.message.type === "request_auth");
    expect(requestAuth).toBeDefined();

    if (requestAuth && requestAuth.message.type === "request_auth") {
      // Provide the auth credential
      const cred: Credential = { type: "api", key: "sk-provided" };
      const handled = await executor.handleProvideAuth(
        requestAuth.message.providerId,
        cred,
        "$global",
        false,
      );
      expect(handled).toBe(true);
    }

    // Wait for flow_completed
    await waitForBroadcasts(sink, 4, 10000);

    const flowCompleted = sink.broadcasts.find((b) => b.message.type === "flow_completed");
    expect(flowCompleted).toBeDefined();
  });

  it("handleProvideAuth returns false when no pending request", async () => {
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

    const cred: Credential = { type: "api", key: "sk-key" };
    const handled = await executor.handleProvideAuth("openai", cred, "$global", false);
    expect(handled).toBe(false);
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
