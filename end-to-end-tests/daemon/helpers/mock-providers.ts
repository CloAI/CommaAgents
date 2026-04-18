// Mock model registration, logger, and strategy fixtures for daemon E2E tests.
//
// Model resolution happens via global registries. Tests call
// registerMockModel() to register mock LanguageModel instances and must
// call resetModelRegistry() + resetGlobalDefaults() in afterEach.

import { registerModel } from "@comma-agents/core";
import type { Logger } from "@comma-agents/daemon";

// Mock model registration

/**
 * Create and register a mock LanguageModel for a given model string.
 *
 * The mock returns a fixed text response via both doGenerate and doStream.
 * Must be paired with resetModelRegistry() in afterEach.
 *
 * @param modelString - Model identifier (e.g. "openai/gpt-4o")
 * @param responseText - Optional fixed response text (defaults to "response from {modelString}")
 */
export function registerMockModel(modelString: string, responseText?: string): void {
  const text = responseText ?? `response from ${modelString}`;

  registerModel(modelString, {
    modelId: modelString,
    specificationVersion: "v3",
    provider: "mock",
    defaultObjectGenerationMode: undefined,
    doGenerate: async () => ({
      content: [{ type: "text" as const, text }],
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
          const textId = "text-0";
          controller.enqueue({ type: "text-start" as const, id: textId });
          controller.enqueue({ type: "text-delta" as const, delta: text, id: textId });
          controller.enqueue({ type: "text-end" as const, id: textId });
          controller.enqueue({
            type: "finish" as const,
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
          });
          controller.close();
        },
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock doesn't need full LanguageModel interface
  } as any);
}

/** Register standard mock models used across daemon E2E tests. */
export function setupMockModels(): void {
  registerMockModel("openai/gpt-4o");
  registerMockModel("anthropic/claude-3.5-sonnet");
}

// Mock Logger

/**
 * Create a silent logger for tests.
 *
 * All methods are no-ops. `child()` returns another silent logger.
 * Pass `capture: true` to collect log entries for assertions.
 */
export function createMockLogger(options?: { capture?: boolean }): Logger & {
  entries: Array<{ level: string; args: unknown[] }>;
} {
  const entries: Array<{ level: string; args: unknown[] }> = [];
  const capture = options?.capture ?? false;

  const log = (level: string) => {
    return (...args: unknown[]) => {
      if (capture) {
        entries.push({ level, args });
      }
    };
  };

  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    child() {
      return createMockLogger(options);
    },
    flush() {},
    close() {},
    entries,
  };
}

// Strategy JSON helpers

/**
 * A minimal single-agent strategy definition.
 * Uses "openai/gpt-4o" provider/model.
 */
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

/**
 * A multi-agent strategy with two LLM agents.
 * Uses "openai/gpt-4o" and "anthropic/claude-3.5-sonnet".
 */
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

/**
 * A strategy with a user agent that blocks for input.
 * The user agent step runs first, so the flow blocks until
 * a `user_input` message is received.
 */
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

/**
 * A strategy with tool-calling agents.
 * The "coder" agent has built-in tools (read, grep, glob).
 */
export const TOOL_AGENT_STRATEGY = JSON.stringify({
  name: "ToolAgent",
  version: "1.0",
  agents: {
    coder: {
      model: "openai/gpt-4o",
      systemPrompt: "You are a coding assistant.",
      tools: ["read", "grep", "glob"],
    },
  },
  flow: {
    name: "Code",
    type: "sequential",
    steps: [{ agent: "coder" }],
  },
});

/**
 * A strategy with broadcast flow — runs all agents in parallel.
 */
export const BROADCAST_STRATEGY = JSON.stringify({
  name: "Broadcast",
  version: "1.0",
  agents: {
    fast: { model: "openai/gpt-4o" },
    slow: { model: "anthropic/claude-3.5-sonnet" },
  },
  flow: {
    name: "Parallel",
    type: "broadcast",
    steps: [{ agent: "fast" }, { agent: "slow" }],
  },
});
