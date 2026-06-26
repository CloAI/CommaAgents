// Tests for the run system — main orchestration layer.
//
// These tests use mock models registered via registerMockModel(),
// mock sinks, and inline strategy content written to temp files.
// The run system is tested end-to-end with the core loadStrategyFromString
// pipeline. Model and credential resolution happen via global registries.

import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createConversationRecord,
  extractProviderIds,
  registerModel,
  resetFlowRegistry,
  resetGlobalDefaults,
  resetModelRegistry,
} from "@comma-agents/core";
import { createDaemonState } from "../state/state";
import {
  MINIMAL_STRATEGY,
  MULTI_AGENT_STRATEGY,
  mockLogger,
  mockSink,
  setupMockModels,
  USER_AGENT_STRATEGY,
  waitForBroadcasts,
  writeTempStrategy,
} from "../test.utils";
import { createRunSystem } from "./run-system";
import type { RunSystem } from "./systems/systems.types";

// Track temp files for cleanup
const tempFiles: string[] = [];
const tempDirs: string[] = [];

async function createTempRunsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "comma-agents-run-system-"));
  tempDirs.push(dir);
  return dir;
}

async function prepareAndStart(
  runSystem: RunSystem,
  clientId: string,
  strategyPath: string,
  input = "",
  requestId?: string,
  modelOverride?: string,
  cwd?: string,
  manifestPath?: string,
  runId?: string,
): Promise<string> {
  const prepared = await runSystem.prepareRun(clientId, {
    strategyPath,
    modelOverride,
    cwd,
    manifestPath,
    runId,
  });
  runSystem.startRun(clientId, prepared.runId, input, requestId);
  return prepared.runId;
}

function registerCapturingModel(modelString: string, prompts: unknown[]): void {
  registerModel(modelString, {
    modelId: modelString,
    specificationVersion: "v3",
    provider: "mock",
    defaultObjectGenerationMode: undefined,
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: "response" }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: {
          total: 10,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 5, text: undefined, reasoning: undefined },
      },
      warnings: [],
    }),
    doStream: async (options: { prompt: unknown }) => {
      prompts.push(options.prompt);
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- focused mock
  } as any);
}

function makeAgentCallEvent(
  agentName: string,
  userText: string,
  responseText: string,
  ts: string,
) {
  return {
    type: "agent_call" as const,
    ts,
    record: createConversationRecord({
      id: `${agentName}-${ts}`,
      agentName,
      createdAt: ts,
      userMessage: userText,
      responseMessages: [{ role: "assistant", content: responseText }],
      text: responseText,
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: "stop",
    }),
  };
}

afterEach(async () => {
  // Clean up global registries
  resetModelRegistry();
  resetFlowRegistry();
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

  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
  delete (globalThis as Record<string, unknown>).__runSystemProjectLoaded;
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

// createRunSystem tests

describe("createRunSystem", () => {
  it("owns and exposes the run store", async () => {
    const runsDir = await createTempRunsDir();
    const runSystem = createRunSystem({
      state: createDaemonState(),
      sink: mockSink(),
      logger: mockLogger(),
      runsDir,
    });

    await runSystem.runStore.appendEvent("stale-run", {
      type: "run_started",
      ts: new Date(0).toISOString(),
      cwd: "/workspace",
      strategyName: "Test",
      strategyPath: "/strategy.json",
    });

    expect(await runSystem.runStore.listRuns()).toHaveLength(1);
    const events = await runSystem.runStore.getEvents("stale-run");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "run_started" });
  });

  it("prepareRun creates a pending run, subscribes client, and returns metadata", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const prepared = await runSystem.prepareRun("client-1", {
      strategyPath: filePath,
    });
    const runId = prepared.runId;

    expect(prepared.strategyName).toBe("Test");
    expect(prepared.agents).toContain("assistant");
    expect(prepared.conversation.records).toEqual([]);
    expect(state.getRun(runId)?.status).toBe("pending");
    expect(await runSystem.runStore.listRuns()).toHaveLength(0);

    // Run should exist in state
    const run = state.getRun(runId);
    expect(run).toBeDefined();
    expect(run?.strategyPath).toBe(filePath);

    // Client should be subscribed
    const subs = state.getSubscriptions("client-1");
    expect(subs).toContain(runId);
  });

  it("prepareRun loads the project manifest before the strategy", async () => {
    setupMockModels();
    const state = createDaemonState();
    state.addClient("client-1");
    const runSystem = createRunSystem({
      state,
      sink: mockSink(),
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });
    const projectDir = await mkdtemp(join(tmpdir(), "comma-run-project-"));
    tempDirs.push(projectDir);
    const strategyPath = join(projectDir, "strategy.json");
    const manifestPath = join(projectDir, "comma-project.json");
    await writeFile(strategyPath, MINIMAL_STRATEGY);
    await writeFile(
      join(projectDir, "entry.ts"),
      "(globalThis as Record<string, unknown>).__runSystemProjectLoaded = true;",
    );
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: "@test/run-project",
        version: "1.0.0",
        strategies: {
          test: {
            path: "strategy.json",
          },
        },
        entry: "entry.ts",
        permissions: {
          executesCode: true,
        },
      }),
    );

    await runSystem.prepareRun("client-1", {
      strategyPath,
      manifestPath,
    });

    expect(
      (globalThis as Record<string, unknown>).__runSystemProjectLoaded,
    ).toBe(true);
  });

  it("prepareRun loads registered custom flows from the project", async () => {
    const state = createDaemonState();
    state.addClient("client-1");
    const runSystem = createRunSystem({
      state,
      sink: mockSink(),
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });
    const projectDir = await mkdtemp(join(tmpdir(), "comma-custom-flow-"));
    tempDirs.push(projectDir);
    const strategyPath = join(projectDir, "strategy.json");
    const manifestPath = join(projectDir, "comma-project.json");
    await writeFile(
      strategyPath,
      JSON.stringify({
        name: "Custom Flow Strategy",
        version: "1.0",
        agents: {
          user: { type: "user", config: { requireInput: false } },
        },
        flow: {
          name: "Custom",
          type: "daemon-test-prefix",
          steps: [{ agent: "user" }],
          config: { prefix: "test: " },
        },
      }),
    );
    await writeFile(
      join(projectDir, "custom-flow.ts"),
      `
import { createFlow, defineFlowType, registerFlow } from "${pathToFileURL(resolve(import.meta.dir, "../../../core/dist/index.js")).href}";
import { z } from "${pathToFileURL(resolve(import.meta.dir, "../../../core/node_modules/zod/index.js")).href}";

registerFlow(
  "daemon-test-prefix",
  defineFlowType({
    configSchema: z.object({ prefix: z.string() }).strict(),
    create: ({ name, steps, config }) => createFlow({
      name,
      steps,
      execute: async (_steps, message) => \`\${config.prefix}\${message}\`,
    }),
  }),
);
`,
    );
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: "@test/custom-flow-project",
        version: "1.0.0",
        strategies: {
          test: {
            path: "strategy.json",
          },
        },
        flows: {
          prefix: {
            path: "custom-flow.ts",
          },
        },
        permissions: {
          executesCode: true,
        },
      }),
    );

    const prepared = await runSystem.prepareRun("client-1", {
      strategyPath,
      manifestPath,
    });

    expect(prepared.strategyName).toBe("Custom Flow Strategy");
    expect(prepared.flowTree.type).toBe("daemon-test-prefix");
  });

  it("prepareRun uses a caller-selected stable runId", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const prepared = await runSystem.prepareRun("client-1", {
      strategyPath: filePath,
      runId: "run-stable",
    });

    expect(prepared.runId).toBe("run-stable");
    expect(state.getRun("run-stable")).toBeDefined();
  });

  it("rejects duplicate run IDs and unknown or repeated starts", async () => {
    setupMockModels();
    const state = createDaemonState();
    state.addClient("client-1");
    const runSystem = createRunSystem({
      state,
      sink: mockSink(),
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });
    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    await runSystem.prepareRun("client-1", {
      strategyPath: filePath,
      runId: "stable-run",
    });
    await expect(
      runSystem.prepareRun("client-1", {
        strategyPath: filePath,
        runId: "stable-run",
      }),
    ).rejects.toThrow("already exists");
    expect(() => runSystem.startRun("client-1", "missing")).toThrow(
      "Prepared run not found",
    );

    runSystem.startRun("client-1", "stable-run", "hello");
    expect(() => runSystem.startRun("client-1", "stable-run")).toThrow(
      "already started",
    );
  });

  it("prepares and repeatedly continues a persisted run with matching-agent history", async () => {
    const capturedPrompts: unknown[] = [];
    registerCapturingModel("openai/gpt-4o", capturedPrompts);
    const state = createDaemonState();
    const sink = mockSink();
    state.addClient("client-1");
    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });
    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    await runSystem.runStore.appendEvent("continued-run", {
      type: "run_started",
      ts: new Date(0).toISOString(),
      strategyPath: filePath,
      strategyName: "Test",
      cwd: "/persisted/cwd",
    });
    await runSystem.runStore.appendEvent(
      "continued-run",
      makeAgentCallEvent(
        "assistant",
        "prior request",
        "prior response",
        new Date(1).toISOString(),
      ),
    );
    await runSystem.runStore.appendEvent(
      "continued-run",
      makeAgentCallEvent(
        "removed-agent",
        "unmatched request",
        "unmatched response",
        new Date(2).toISOString(),
      ),
    );
    await runSystem.runStore.appendEvent("continued-run", {
      type: "run_completed",
      ts: new Date(3).toISOString(),
      status: "completed",
    });

    const prepared = await runSystem.prepareRun("client-1", {
      runId: "continued-run",
    });
    expect(prepared.runId).toBe("continued-run");
    expect(prepared.conversation.records).toHaveLength(2);
    expect(prepared.conversation.records[0]).toMatchObject({
      agentName: "assistant",
      text: "prior response",
    });
    expect(await runSystem.runStore.getEvents("continued-run")).toHaveLength(4);
    expect(() =>
      runSystem.startRun("client-1", "continued-run", "wrong command"),
    ).toThrow("prepared for continuation");

    runSystem.continueRun("client-1", "continued-run", "first continuation");
    await waitForBroadcasts(sink, 6, 10000);

    expect(JSON.stringify(capturedPrompts[0])).toContain("prior request");
    expect(JSON.stringify(capturedPrompts[0])).toContain("prior response");
    expect(JSON.stringify(capturedPrompts[0])).toContain("first continuation");
    expect(JSON.stringify(capturedPrompts[0])).not.toContain(
      "unmatched request",
    );

    await runSystem.prepareRun("client-1", { runId: "continued-run" });
    runSystem.continueRun("client-1", "continued-run", "second continuation");
    await waitForBroadcasts(sink, 12, 10000);

    expect(capturedPrompts).toHaveLength(2);
    expect(JSON.stringify(capturedPrompts[1])).toContain("second continuation");
    const events = await runSystem.runStore.getEvents("continued-run");
    expect(events.filter((event) => event.type === "run_started")).toHaveLength(
      3,
    );
    expect(
      events.filter((event) => event.type === "run_completed"),
    ).toHaveLength(3);
  });

  it("extracts genuine human inputs anchored to the first agent_call of each run segment", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    state.addClient("client-1");
    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });
    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    // Segment one: a human prompt followed by two sequential agent calls,
    // where the second agent's userMessage echoes the first agent's output.
    await runSystem.runStore.appendEvent("inputs-run", {
      type: "run_started",
      ts: new Date(0).toISOString(),
      strategyPath: filePath,
      strategyName: "Test",
      cwd: "/persisted/cwd",
      initialInput: "human prompt one",
    });
    await runSystem.runStore.appendEvent(
      "inputs-run",
      makeAgentCallEvent(
        "assistant",
        "human prompt one",
        "first response",
        new Date(1).toISOString(),
      ),
    );
    await runSystem.runStore.appendEvent(
      "inputs-run",
      makeAgentCallEvent(
        "assistant",
        "first response",
        "second response",
        new Date(2).toISOString(),
      ),
    );
    await runSystem.runStore.appendEvent("inputs-run", {
      type: "run_completed",
      ts: new Date(3).toISOString(),
      status: "completed",
    });
    // Segment two: a continuation prompt and its single agent call.
    await runSystem.runStore.appendEvent("inputs-run", {
      type: "run_started",
      ts: new Date(4).toISOString(),
      strategyPath: filePath,
      strategyName: "Test",
      cwd: "/persisted/cwd",
      initialInput: "human prompt two",
    });
    await runSystem.runStore.appendEvent(
      "inputs-run",
      makeAgentCallEvent(
        "assistant",
        "human prompt two",
        "third response",
        new Date(5).toISOString(),
      ),
    );

    const prepared = await runSystem.prepareRun("client-1", {
      runId: "inputs-run",
    });

    // One human input per run segment, each anchored to the first record of
    // that segment — never to the inter-agent handoff record.
    expect(prepared.conversation.inputs).toEqual([
      {
        text: "human prompt one",
        beforeRecordId: `assistant-${new Date(1).toISOString()}`,
      },
      {
        text: "human prompt two",
        beforeRecordId: `assistant-${new Date(5).toISOString()}`,
      },
    ]);
  });

  it("anchors a human input with no following agent_call as a trailing input", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    state.addClient("client-1");
    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });
    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    await runSystem.runStore.appendEvent("trailing-input-run", {
      type: "run_started",
      ts: new Date(0).toISOString(),
      strategyPath: filePath,
      strategyName: "Test",
      cwd: "/persisted/cwd",
      initialInput: "prompt with no calls yet",
    });

    const prepared = await runSystem.prepareRun("client-1", {
      runId: "trailing-input-run",
    });

    expect(prepared.conversation.records).toHaveLength(0);
    expect(prepared.conversation.inputs).toEqual([
      { text: "prompt with no calls yet" },
    ]);
  });

  it("reconstructs compacted conversation history from retention events", async () => {
    const state = createDaemonState();
    const sink = mockSink();
    state.addClient("client-1");
    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });
    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);
    const oldEvent = makeAgentCallEvent(
      "assistant",
      "old request",
      "old response",
      new Date(1).toISOString(),
    );
    const recentEvent = makeAgentCallEvent(
      "assistant",
      "recent request",
      "recent response",
      new Date(2).toISOString(),
    );
    const summaryRecord = createConversationRecord({
      id: "summary-1",
      agentName: "assistant",
      createdAt: new Date(3).toISOString(),
      userMessage: "[Earlier conversation compacted - summary follows.]",
      responseMessages: [{ role: "assistant", content: "summary" }],
      text: "summary",
      usage: { promptTokens: 0, completionTokens: 0 },
      finishReason: "stop",
      status: "active",
    });

    await runSystem.runStore.appendEvent("compacted-run", {
      type: "run_started",
      ts: new Date(0).toISOString(),
      strategyPath: filePath,
      strategyName: "Test",
      cwd: "/persisted/cwd",
    });
    await runSystem.runStore.appendEvent("compacted-run", oldEvent);
    await runSystem.runStore.appendEvent("compacted-run", recentEvent);
    await runSystem.runStore.appendEvent("compacted-run", {
      type: "conversation_retention",
      ts: new Date(3).toISOString(),
      event: {
        id: "retention-1",
        agentName: "assistant",
        createdAt: new Date(3).toISOString(),
        kind: "compaction",
        reason: "context-window",
        trigger: {
          contextUsage: { totalTokens: 850 },
          tokenLimit: 1_000,
          ratio: 0.85,
          thresholdRatio: 0.85,
        },
        recordsCompacted: 1,
        recordsRetained: 1,
        summaryRecord,
        supersededRecordIds: [oldEvent.record.id],
        insertBeforeRecordId: recentEvent.record.id,
      },
    });

    const prepared = await runSystem.prepareRun("client-1", {
      runId: "compacted-run",
    });

    expect(prepared.conversation.records.map((record) => record.id)).toEqual([
      oldEvent.record.id,
      "summary-1",
      recentEvent.record.id,
    ]);
    expect(prepared.conversation.records[0]).toMatchObject({
      status: "superseded",
      supersededBy: "summary-1",
    });
    expect(prepared.conversation.retentionEvents).toHaveLength(1);
  });

  it("allows strategy overrides while new agents start without prior history", async () => {
    const assistantPrompts: unknown[] = [];
    const newcomerPrompts: unknown[] = [];
    registerCapturingModel("openai/gpt-4o", assistantPrompts);
    registerCapturingModel("anthropic/claude-3.5-sonnet", newcomerPrompts);
    const state = createDaemonState();
    const sink = mockSink();
    state.addClient("client-1");
    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });
    const originalPath = await writeTempStrategy(MINIMAL_STRATEGY);
    const overridePath = await writeTempStrategy(
      JSON.stringify({
        name: "Override",
        version: "1.0",
        agents: {
          assistant: { model: "openai/gpt-4o" },
          newcomer: { model: "anthropic/claude-3.5-sonnet" },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "assistant" }, { agent: "newcomer" }],
        },
      }),
    );
    tempFiles.push(originalPath, overridePath);

    await runSystem.runStore.appendEvent("override-run", {
      type: "run_started",
      ts: new Date(0).toISOString(),
      strategyPath: originalPath,
      strategyName: "Test",
      cwd: "/persisted/cwd",
    });
    await runSystem.runStore.appendEvent(
      "override-run",
      makeAgentCallEvent(
        "assistant",
        "assistant history",
        "assistant result",
        new Date(1).toISOString(),
      ),
    );
    await runSystem.runStore.appendEvent("override-run", {
      type: "run_completed",
      ts: new Date(2).toISOString(),
      status: "completed",
    });

    const prepared = await runSystem.prepareRun("client-1", {
      runId: "override-run",
      strategyPath: overridePath,
      cwd: "/override/cwd",
    });
    expect(prepared.strategyName).toBe("Override");
    runSystem.continueRun("client-1", "override-run", "continue override");
    await waitForBroadcasts(sink, 10, 10000);

    expect(JSON.stringify(assistantPrompts[0])).toContain("assistant history");
    expect(JSON.stringify(newcomerPrompts[0])).not.toContain(
      "assistant history",
    );
    const overview = (await runSystem.runStore.listRuns())[0];
    expect(overview).toMatchObject({
      runId: "override-run",
      strategyPath: overridePath,
      strategyName: "Override",
      cwd: "/override/cwd",
      status: "completed",
    });
  });

  it("rejects continuation commands for fresh, missing, and active runs", async () => {
    setupMockModels();
    const state = createDaemonState();
    state.addClient("client-1");
    const runSystem = createRunSystem({
      state,
      sink: mockSink(),
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });
    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    await runSystem.prepareRun("client-1", {
      strategyPath: filePath,
      runId: "fresh-run",
    });
    expect(() =>
      runSystem.continueRun("client-1", "fresh-run", "continue"),
    ).toThrow("not prepared for continuation");
    await expect(
      runSystem.prepareRun("client-1", { runId: "missing-run" }),
    ).rejects.toThrow("Run not found");
    await expect(
      runSystem.prepareRun("client-1", { runId: "fresh-run" }),
    ).rejects.toThrow("already exists");

    await runSystem.runStore.appendEvent("active-persisted-run", {
      type: "run_started",
      ts: new Date().toISOString(),
      strategyPath: filePath,
      strategyName: "Test",
      cwd: "/workspace",
    });
    state.createRun(filePath, "Test", "/workspace", "active-persisted-run");
    await expect(
      runSystem.prepareRun("client-1", { runId: "active-persisted-run" }),
    ).rejects.toThrow("still active");
  });

  it("stopRun cleans up a prepared run without persisting it", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();
    state.addClient("client-1");
    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });
    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const prepared = await runSystem.prepareRun("client-1", {
      strategyPath: filePath,
    });
    runSystem.stopRun(prepared.runId);
    await runSystem.shutdown();

    expect(state.getRun(prepared.runId)?.status).toBe("cancelled");
    expect(await runSystem.runStore.listRuns()).toHaveLength(0);
    expect(
      runSystem.actions.invoke("steer", prepared.runId, "after stop"),
    ).toBe(false);
  });

  it("fire-and-forget: startRun returns before execution completes", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const runId = await prepareAndStart(
      runSystem,
      "client-1",
      filePath,
      "hello",
    );

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

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    await prepareAndStart(runSystem, "client-1", filePath, "hello");

    // Wait for strategy_started broadcast
    await waitForBroadcasts(sink, 1);

    const flowStarted = sink.broadcasts.find(
      (b) => b.message.type === "strategy_started",
    );
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

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    await prepareAndStart(runSystem, "client-1", filePath, "hello");

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

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const runId = await prepareAndStart(
      runSystem,
      "client-1",
      filePath,
      "hello",
    );

    // Wait for strategy_completed
    await waitForBroadcasts(sink, 4, 10000);

    const flowCompleted = sink.broadcasts.find(
      (b) => b.message.type === "strategy_completed",
    );
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

  it("discovers project skills and wires them into strategy agents", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();
    state.addClient("client-1");

    const cwd = await mkdtemp(join(tmpdir(), "comma-skills-"));
    tempDirs.push(cwd);
    const skillDir = join(cwd, ".comma", "skills", "required-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "name: required-skill",
        "description: Required test instructions.",
        "---",
        "Follow the required test instructions.",
      ].join("\n"),
    );

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });
    const filePath = await writeTempStrategy(
      JSON.stringify({
        name: "Skills",
        version: "1.0",
        agents: {
          assistant: {
            model: "openai/gpt-4o",
            skills: ["required-skill"],
          },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "assistant" }],
        },
      }),
    );
    tempFiles.push(filePath);

    const runId = await prepareAndStart(
      runSystem,
      "client-1",
      filePath,
      "hello",
      undefined,
      undefined,
      cwd,
    );
    await waitForBroadcasts(sink, 4, 10000);

    expect(state.getRun(runId)?.status).toBe("completed");
  });

  it("broadcasts strategy_error when strategy file is invalid", async () => {
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy("{ invalid json content");
    tempFiles.push(filePath);

    await expect(
      runSystem.prepareRun("client-1", { strategyPath: filePath }),
    ).rejects.toThrow();
    expect(state.listRuns()).toHaveLength(0);
  });

  it("broadcasts strategy_error when strategy file is not found", async () => {
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    await expect(
      runSystem.prepareRun("client-1", {
        strategyPath: "/nonexistent/path/strategy.json",
      }),
    ).rejects.toThrow("not found");
    expect(state.listRuns()).toHaveLength(0);
  });

  it("stopRun aborts execution and broadcasts strategy_error with CANCELLED", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const runId = await prepareAndStart(
      runSystem,
      "client-1",
      filePath,
      "hello",
    );

    // Stop immediately
    runSystem.stopRun(runId);

    // State should be cancelled
    const run = state.getRun(runId);
    expect(run?.status).toBe("cancelled");
    expect(run?.error?.code).toBe("CANCELLED");

    // Should have broadcast a strategy_error with CANCELLED
    const cancelledMsg = sink.broadcasts.find(
      (b) =>
        b.message.type === "strategy_error" &&
        b.message.error.code === "CANCELLED",
    );
    expect(cancelledMsg).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(state.getRun(runId)?.status).toBe("cancelled");
    expect(
      sink.broadcasts.some(
        (broadcast) => broadcast.message.type === "strategy_completed",
      ),
    ).toBe(false);
  });

  it("resolveInput routes to the correct run's pending input", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(USER_AGENT_STRATEGY);
    tempFiles.push(filePath);

    // Pass empty input so the first user-agent step routes through the input
    // request (instead of being satisfied by the run system's first-input seed).
    const runId = await prepareAndStart(runSystem, "client-1", filePath, "");

    // Wait for request_input broadcast
    await waitForBroadcasts(sink, 2, 10000);

    const requestInput = sink.broadcasts.find(
      (b) => b.message.type === "request_input",
    );
    expect(requestInput).toBeDefined();

    if (requestInput && requestInput.message.type === "request_input") {
      const handled = runSystem.actions.invoke(
        "resolveInput",
        runId,
        requestInput.message.agentName,
        "user response text",
      );
      expect(handled).toBe(true);
    }

    // Wait for strategy_completed
    await waitForBroadcasts(sink, 6, 10000);

    const flowCompleted = sink.broadcasts.find(
      (b) => b.message.type === "strategy_completed",
    );
    expect(flowCompleted).toBeDefined();

    const agentEvents = sink.broadcasts.filter(
      (broadcast) =>
        broadcast.message.type === "agent_streaming" ||
        broadcast.message.type === "agent_output",
    );
    expect(
      agentEvents.some(
        (broadcast) => broadcast.message.agentName === "assistant",
      ),
    ).toBe(true);
    expect(
      agentEvents.some((broadcast) => broadcast.message.agentName === "user"),
    ).toBe(false);
  });

  it("uses initial input for a user-first strategy without requesting it again", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(USER_AGENT_STRATEGY);
    tempFiles.push(filePath);

    const runId = await prepareAndStart(
      runSystem,
      "client-1",
      filePath,
      "build this",
    );

    await waitForBroadcasts(sink, 6, 10000);

    expect(
      sink.broadcasts.some(
        (broadcast) => broadcast.message.type === "request_input",
      ),
    ).toBe(false);
    expect(
      sink.broadcasts.some(
        (broadcast) => broadcast.message.type === "strategy_completed",
      ),
    ).toBe(true);
    expect(state.getRun(runId)?.status).toBe("completed");
  });

  it("resolveInput returns false for unknown run", async () => {
    const state = createDaemonState();
    const sink = mockSink();

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    expect(
      runSystem.actions.invoke("resolveInput", "nonexistent", "agent", "text"),
    ).toBe(false);
  });

  it("broadcasts strategy_error when no model is registered for a provider", async () => {
    // No mock models registered — model resolution will fail at call time
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const runId = await prepareAndStart(
      runSystem,
      "client-1",
      filePath,
      "hello",
    );

    // Wait for strategy_error broadcast (model resolution fails)
    await waitForBroadcasts(sink, 1, 5000);

    const flowError = sink.broadcasts.find(
      (b) => b.message.type === "strategy_error",
    );
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

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(MULTI_AGENT_STRATEGY);
    tempFiles.push(filePath);

    await prepareAndStart(runSystem, "client-1", filePath, "hello");

    // Wait for strategy_completed (1 strategy_started + 2 step_started + 2 step_completed + agent events + strategy_completed)
    await waitForBroadcasts(sink, 6, 10000);

    const types = sink.broadcasts.map((b) => b.message.type);

    // Should have strategy_started
    expect(types).toContain("strategy_started");
    // Should have step events for both agents
    expect(
      types.filter((t) => t === "step_started").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      types.filter((t) => t === "step_completed").length,
    ).toBeGreaterThanOrEqual(2);
    // Should have strategy_completed
    expect(types).toContain("strategy_completed");
  });

  it("steer returns false for an unknown run", async () => {
    const state = createDaemonState();
    const sink = mockSink();

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    expect(runSystem.actions.invoke("steer", "nonexistent", "hello")).toBe(
      false,
    );
  });

  it("steer queues text and broadcasts steer_queued for a running run", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    // A user-agent strategy blocks at the first step, keeping the run live.
    const filePath = await writeTempStrategy(USER_AGENT_STRATEGY);
    tempFiles.push(filePath);

    const runId = await prepareAndStart(runSystem, "client-1", filePath, "");
    await waitForBroadcasts(sink, 2, 10000);

    const queued = runSystem.actions.invoke(
      "steer",
      runId,
      "steer toward the bug",
    );
    expect(queued).toBe(true);

    const steerQueued = sink.broadcasts.find(
      (b) => b.message.type === "steer_queued",
    );
    expect(steerQueued).toBeDefined();
    if (steerQueued && steerQueued.message.type === "steer_queued") {
      expect(steerQueued.message.runId).toBe(runId);
      expect(steerQueued.message.text).toBe("steer toward the bug");
    }
  });

  it("steer returns false once a run has finished", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    const runId = await prepareAndStart(
      runSystem,
      "client-1",
      filePath,
      "hello",
    );
    await waitForBroadcasts(sink, 4, 10000);

    // Run has completed — steering is no longer accepted.
    expect(state.getRun(runId)?.status).toBe("completed");
    expect(runSystem.actions.invoke("steer", runId, "too late")).toBe(false);
  });

  it("requestId is echoed in strategy_started and strategy_completed", async () => {
    setupMockModels();
    const state = createDaemonState();
    const sink = mockSink();

    state.addClient("client-1");

    const runSystem = createRunSystem({
      state,
      sink,
      logger: mockLogger(),
      runsDir: await createTempRunsDir(),
    });

    const filePath = await writeTempStrategy(MINIMAL_STRATEGY);
    tempFiles.push(filePath);

    await prepareAndStart(runSystem, "client-1", filePath, "hello", "req-123");

    await waitForBroadcasts(sink, 4, 10000);

    const flowStarted = sink.broadcasts.find(
      (b) => b.message.type === "strategy_started",
    );
    const flowCompleted = sink.broadcasts.find(
      (b) => b.message.type === "strategy_completed",
    );

    expect(flowStarted?.message.requestId).toBe("req-123");
    expect(flowCompleted?.message.requestId).toBe("req-123");
  });
});
