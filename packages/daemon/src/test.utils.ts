// Shared test utilities for daemon unit tests.
//
// Provides mock factories for EventSink, Logger, and model registration
// helpers. Also includes strategy fixtures and temp-file helpers.
//
// Model and credential resolution happen via global registries. Tests
// use registerMockModel() to register mock LanguageModel instances
// and must call resetModelRegistry() + resetGlobalDefaults() in afterEach.

import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerModel } from "@comma-agents/core";
import type { EventSink } from "./executor/event-sink";
import type { Logger } from "./logger/logger.types";
import type { DaemonMessage } from "./server/protocol/messages";
import type { PersistedSession, SessionStore } from "./sessions";
import { SESSION_SCHEMA_VERSION } from "./sessions";

// Mock model registration

/**
 * Create and register a mock LanguageModel for a given model string.
 *
 * The mock returns a fixed text response and an empty stream.
 * Must be paired with resetModelRegistry() in afterEach.
 */
export function registerMockModel(modelString: string): void {
  registerModel(modelString, {
    modelId: modelString,
    specificationVersion: "v3",
    provider: "mock",
    defaultObjectGenerationMode: undefined,
    doGenerate: async () => ({
      content: [
        { type: "text" as const, text: `response from ${modelString}` },
      ],
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
        start(controller) {
          controller.close();
        },
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock doesn't need full LanguageModel interface
  } as any);
}

/** Register standard mock models used across daemon tests. */
export function setupMockModels(): void {
  registerMockModel("openai/gpt-4o");
  registerMockModel("anthropic/claude-3.5-sonnet");
}

/** Mock EventSink that records messages. */
export function mockSink(): EventSink & {
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

/** Silent logger that discards all messages. */
export function mockLogger(): Logger {
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

// Strategy fixtures

/**
 * Minimal in-memory SessionStore for executor/dispatcher tests.
 *
 * One session per cwd (auto-created on access). All operations succeed
 * synchronously and are observable via the returned `sessions` map.
 */
export function mockSessionStore(): SessionStore & {
  sessions: Map<string, PersistedSession>;
} {
  const sessions = new Map<string, PersistedSession>();
  const cwdToId = new Map<string, string>();

  function ensure(cwd: string): PersistedSession {
    const existing = cwdToId.get(cwd);
    if (existing) {
      const session = sessions.get(existing);
      if (session) return session;
    }
    const id = `session-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const session: PersistedSession = {
      metadata: {
        id,
        title: id,
        cwd,
        cwdHash: "mock",
        createdAt: now,
        updatedAt: now,
        schemaVersion: SESSION_SCHEMA_VERSION,
      },
      turns: [],
      runs: [],
    };
    sessions.set(id, session);
    cwdToId.set(cwd, id);
    return session;
  }

  return {
    sessions,
    async getOrCreateForCwd(cwd) {
      return ensure(cwd);
    },
    getOrCreateForCwdSync(cwd) {
      return ensure(cwd);
    },
    async load(sessionId) {
      return sessions.get(sessionId) ?? null;
    },
    async list(filter) {
      const all = Array.from(sessions.values()).map((s) => s.metadata);
      if (filter?.cwd) return all.filter((m) => m.cwd === filter.cwd);
      return all;
    },
    async appendTurn(sessionId, turn) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error(`unknown session ${sessionId}`);
      sessions.set(sessionId, {
        ...s,
        turns: [...s.turns, turn],
        metadata: { ...s.metadata, updatedAt: new Date().toISOString() },
      });
    },
    async recordRun(sessionId, summary) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error(`unknown session ${sessionId}`);
      const filtered = s.runs.filter((r) => r.runId !== summary.runId);
      sessions.set(sessionId, {
        ...s,
        runs: [...filtered, summary],
        metadata: { ...s.metadata, updatedAt: new Date().toISOString() },
      });
    },
    async rename(sessionId, title) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error(`unknown session ${sessionId}`);
      const newTitle = title ?? sessionId;
      const metadata = {
        ...s.metadata,
        title: newTitle,
        updatedAt: new Date().toISOString(),
      };
      sessions.set(sessionId, { ...s, metadata });
      return metadata;
    },
    async delete(sessionId) {
      const s = sessions.get(sessionId);
      if (!s) return false;
      sessions.delete(sessionId);
      for (const [cwd, id] of cwdToId.entries()) {
        if (id === sessionId) cwdToId.delete(cwd);
      }
      return true;
    },
  };
}

// Strategy fixtures

/** Minimal strategy: single agent, sequential flow. */
export const MINIMAL_STRATEGY = JSON.stringify({
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

/** Multi-agent strategy: two agents in a sequential flow. */
export const MULTI_AGENT_STRATEGY = JSON.stringify({
  name: "MultiAgent",
  version: "1.0",
  agents: {
    writer: { model: "openai/gpt-4o", systemPrompt: "You write code." },
    reviewer: {
      model: "anthropic/claude-3.5-sonnet",
      systemPrompt: "You review code.",
    },
  },
  flow: {
    name: "Review",
    type: "sequential",
    steps: [{ agent: "writer" }, { agent: "reviewer" }],
  },
});

/** Strategy with a user agent that blocks for input. */
export const USER_AGENT_STRATEGY = JSON.stringify({
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

// Temp-file helpers

/** Write a strategy JSON string to a temp file and return the path. */
export async function writeTempStrategy(
  content: string,
  extension: string = "json",
): Promise<string> {
  const filename = `test-strategy-${crypto.randomUUID()}.${extension}`;
  const filePath = join(tmpdir(), filename);
  await Bun.write(filePath, content);
  return filePath;
}

/** Wait for broadcasts to accumulate, with a maximum wait time. */
export async function waitForBroadcasts(
  sink: ReturnType<typeof mockSink>,
  count: number,
  timeoutMs: number = 5000,
): Promise<void> {
  const start = Date.now();
  while (sink.broadcasts.length < count) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timed out waiting for ${count} broadcasts (got ${sink.broadcasts.length})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
