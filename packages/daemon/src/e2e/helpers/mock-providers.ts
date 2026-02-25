// Mock providers, credential store, resolver, and logger for daemon E2E tests.
//
// These are the daemon-specific counterparts of the core mock helpers.
// They create mock AI models that work with the daemon's strategy executor
// pipeline, from file-based strategy loading through to WebSocket events.
//
// Unlike the core mock model (which returns configurable responses per-call),
// the daemon mock model creates models by (providerId, modelId) pair with
// fixed responses — matching how the daemon's provider resolver works.

import type { ProviderFactory } from "@comma-agents/core";
import type { LanguageModel } from "ai";

import type { CredentialStore } from "../../credentials/types";
import type { ProviderResolver } from "../../executor/executor";
import type { Logger } from "../../logger/types";
import type { Credential } from "../../protocol/shared";

// ---------------------------------------------------------------------------
// Mock LanguageModel (AI SDK v3)
// ---------------------------------------------------------------------------

/**
 * Create a mock LanguageModel that returns a fixed response.
 *
 * The response is always "response from {id}" (matching the existing
 * server.test.ts convention) unless `responseText` is provided.
 *
 * @param id - Model identifier (typically "provider/model")
 * @param responseText - Optional fixed response text
 */
export function createMockModel(id: string, responseText?: string): LanguageModel {
  const text = responseText ?? `response from ${id}`;

  return {
    modelId: id,
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
          controller.close();
        },
      }),
    }),
  } as unknown as LanguageModel;
}

// ---------------------------------------------------------------------------
// Mock ProviderFactory
// ---------------------------------------------------------------------------

/**
 * Create a ProviderFactory that returns mock models for any model ID.
 *
 * The returned model's response is "response from {providerName}/{modelId}".
 *
 * @param providerName - Provider identifier (e.g. "openai", "anthropic")
 * @param responses - Optional map of modelId → response text for per-model customization
 */
export function createMockProviderFactory(
  providerName: string,
  responses?: Record<string, string>,
): ProviderFactory {
  return (modelId: string) => {
    const text = responses?.[modelId];
    return createMockModel(`${providerName}/${modelId}`, text);
  };
}

// ---------------------------------------------------------------------------
// Mock CredentialStore
// ---------------------------------------------------------------------------

/**
 * Create a mock CredentialStore that always resolves with an API key.
 *
 * By default, `resolve()` returns `{ type: "api", key: "test-key" }`.
 * Pass `resolveReturns` to customize, or `null` to force auth-bridge flow.
 */
export function createMockCredentialStore(
  resolveReturns: Credential | null = { type: "api" as const, key: "test-key" },
): CredentialStore {
  return {
    async resolve() {
      return resolveReturns ?? undefined;
    },
    async get() {
      return undefined;
    },
    async set() {},
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

// ---------------------------------------------------------------------------
// Mock ProviderResolver
// ---------------------------------------------------------------------------

/**
 * Create a mock ProviderResolver that creates mock ProviderFactories.
 *
 * By default, all providers return "response from {providerId}/{modelId}".
 * Pass `providerResponses` to customize responses per provider/model.
 *
 * @example
 * ```ts
 * // Default — all models return "response from openai/gpt-4o" etc.
 * const resolver = createMockProviderResolver();
 *
 * // Custom — specific models return custom text
 * const resolver = createMockProviderResolver({
 *   openai: { "gpt-4o": "I am GPT-4o" },
 *   anthropic: { "claude-3.5-sonnet": "I am Claude" },
 * });
 * ```
 */
export function createMockProviderResolver(
  providerResponses?: Record<string, Record<string, string>>,
): ProviderResolver {
  return (providerId: string, _credential: Credential) => {
    const responses = providerResponses?.[providerId];
    return createMockProviderFactory(providerId, responses);
  };
}

// ---------------------------------------------------------------------------
// Mock Logger
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Strategy JSON helpers
// ---------------------------------------------------------------------------

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
