// token-tracking — Token usage tracker factory and agent hook.
//
// Contains createTokenTracker (low-level factory) and useTokenTracking
// (high-level hook that auto-wires a tracker into an agent's lifecycle).
//
// Accumulates real token usage reported by the AI SDK after each call.
// Provides snapshots with context budget estimation when model metadata
// (context window size) is available.

import type { Agent } from "../../../agents/agent/agent.types";
import { hookIntoAgent } from "../../../agents/hook-into-agent/hook-into-agent";
import { MODEL_CATALOG } from "./token-tracking.constants";
import type {
  ModelMetadata,
  TokenSnapshot,
  TokenTracker,
  TokenTrackerConfig,
  TokenUsageRecord,
  UseTokenTrackingConfig,
} from "./token-tracking.types";

// Helpers

/** Look up model metadata from the built-in catalog. */
function resolveModelMetadata(
  config: TokenTrackerConfig,
): ModelMetadata | undefined {
  if (config.modelMetadata) {
    return config.modelMetadata;
  }
  if (config.model) {
    return MODEL_CATALOG[config.model];
  }
  return undefined;
}

/** Build a snapshot from current state. */
function buildSnapshot(
  calls: readonly TokenUsageRecord[],
  metadata: ModelMetadata | undefined,
): TokenSnapshot {
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (const call of calls) {
    totalPromptTokens += call.promptTokens;
    totalCompletionTokens += call.completionTokens;
  }

  const totalTokens = totalPromptTokens + totalCompletionTokens;
  const lastCall = calls.length > 0 ? calls[calls.length - 1] : undefined;
  const lastPromptTokens = lastCall?.promptTokens;

  // Context budget — only available when we have both metadata and a last call
  let contextUsagePercent: number | undefined;
  let contextRemaining: number | undefined;

  if (metadata && lastPromptTokens !== undefined) {
    contextUsagePercent = lastPromptTokens / metadata.contextWindow;
    contextRemaining = Math.max(0, metadata.contextWindow - lastPromptTokens);
  }

  return {
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    callCount: calls.length,
    lastPromptTokens,
    contextWindow: metadata?.contextWindow,
    maxOutputTokens: metadata?.maxOutputTokens,
    contextUsagePercent,
    contextRemaining,
    calls,
  };
}

/**
 * Get the model string from the agent's config.
 * Returns undefined if the agent has no model configured.
 */
function resolveModelString(agent: Agent): string | undefined {
  return agent.config?.model;
}

// createTokenTracker

/**
 * Create a new token usage tracker.
 *
 * The tracker accumulates real token counts from the AI SDK (not estimates).
 * When model metadata is available (via the built-in catalog or explicit config),
 * snapshots include context budget information.
 *
 * Typically you should use the higher-level `useTokenTracking()` hook, which
 * creates a tracker, auto-detects the model, and installs the `afterCallResult`
 * hook on the agent automatically. Use `createTokenTracker()` directly when you
 * need a standalone tracker or want full control over hook wiring.
 *
 * @example
 * ```ts
 * import { useTokenTracking } from "@comma-agents/core";
 *
 * // Recommended: auto-detects model from agent config
 * const tracker = useTokenTracking(agent);
 *
 * await agent.call("Hello");
 * const snap = tracker.snapshot();
 * console.log(`${snap.totalTokens} tokens used`);
 * console.log(`Context ${(snap.contextUsagePercent! * 100).toFixed(1)}% full`);
 * console.log(`${snap.contextRemaining} tokens remaining`);
 * ```
 *
 * @example
 * ```ts
 * // With explicit metadata for a model not in the catalog
 * const tracker = createTokenTracker({
 *   modelMetadata: { contextWindow: 32_000, maxOutputTokens: 4_096 },
 * });
 * ```
 *
 * @example
 * ```ts
 * // Without model metadata — usage tracking only, no budget info
 * const tracker = createTokenTracker({});
 * ```
 */
export function createTokenTracker(
  config: TokenTrackerConfig = {},
): TokenTracker {
  // -- Closure state --
  const metadata = resolveModelMetadata(config);
  let calls: TokenUsageRecord[] = [];

  // -- The returned object --
  return {
    record(promptTokens: number, completionTokens: number): void {
      const record: TokenUsageRecord = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        timestamp: Date.now(),
      };
      calls = [...calls, record];
    },

    snapshot(): TokenSnapshot {
      return buildSnapshot(calls, metadata);
    },

    reset(): void {
      calls = [];
    },
  };
}

// useTokenTracking

/**
 * Hook token tracking into an agent.
 *
 * Creates a `TokenTracker`, installs an `afterCallResult` hook on the agent
 * that records token usage after each call, and returns the tracker.
 *
 * The model's context window metadata is resolved in this order:
 * 1. Explicit `config.modelMetadata` (if provided)
 * 2. Explicit `config.model` string (catalog lookup)
 * 3. Auto-detected from `agent.config.model` (already a "providerID/modelID" string)
 *
 * @param agent - An agent created by `createAgent()`.
 * @param config - Optional configuration to override model detection.
 * @returns A `TokenTracker` that accumulates usage from subsequent agent calls.
 *
 * @example
 * ```ts
 * import { createAgent, useTokenTracking } from "@comma-agents/core";
 *
 * const agent = createAgent({
 *   name: "writer",
 *   model: "openai/gpt-4o",
 *   systemPrompt: "You are helpful.",
 * });
 *
 * // Auto-detects model, looks up catalog for context window info
 * const tracker = useTokenTracking(agent);
 *
 * await agent.call("Hello");
 * const snap = tracker.snapshot();
 * console.log(`Used ${snap.totalTokens} tokens`);
 * console.log(`Context ${(snap.contextUsagePercent! * 100).toFixed(1)}% full`);
 * console.log(`${snap.contextRemaining} tokens remaining`);
 * ```
 *
 * @example
 * ```ts
 * // Explicit metadata for a model not in the catalog
 * const tracker = useTokenTracking(agent, {
 *   modelMetadata: { contextWindow: 32_000, maxOutputTokens: 4_096 },
 * });
 * ```
 */
export function useTokenTracking(
  agent: Agent,
  config?: UseTokenTrackingConfig,
): TokenTracker {
  // Resolve model string: explicit config > auto-detect from agent
  const modelString = config?.model ?? resolveModelString(agent);

  const tracker = createTokenTracker({
    model: modelString,
    modelMetadata: config?.modelMetadata,
  });

  hookIntoAgent(agent, {
    afterCallResult: [
      (result) => {
        tracker.record(
          result.usage.promptTokens,
          result.usage.completionTokens,
        );
      },
    ],
  });

  return tracker;
}
