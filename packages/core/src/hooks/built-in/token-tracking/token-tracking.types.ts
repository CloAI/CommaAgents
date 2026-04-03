// Token tracking types — token usage tracking, context budget, model metadata, and hook config.

/**
 * Metadata about a model's token limits.
 *
 * Used to compute context budget estimates (percentage used, remaining tokens).
 * If context window information is unavailable, budget-related fields on
 * `TokenSnapshot` will be `undefined`.
 */
export interface ModelMetadata {
  /** Total context window size in tokens. */
  readonly contextWindow: number;
  /** Maximum output tokens the model can generate per response. */
  readonly maxOutputTokens?: number;
}

/**
 * Configuration for creating a TokenTracker.
 */
export interface TokenTrackerConfig {
  /**
   * Model identifier in `"providerID/modelID"` format (e.g., `"openai/gpt-4o"`).
   * Used to look up context window metadata from the built-in model catalog.
   */
  readonly model?: string;

  /**
   * Explicit model metadata. When provided, overrides the built-in catalog lookup.
   * Use this for models not in the catalog, or to override catalog values.
   */
  readonly modelMetadata?: ModelMetadata;
}

/**
 * A single recorded call's token usage, captured from the `afterCallResult` hook.
 */
export interface TokenUsageRecord {
  /** Number of prompt (input) tokens for this call. */
  readonly promptTokens: number;
  /** Number of completion (output) tokens for this call. */
  readonly completionTokens: number;
  /** Total tokens for this call (`promptTokens + completionTokens`). */
  readonly totalTokens: number;
  /** Timestamp of when this usage was recorded. */
  readonly timestamp: number;
}

/**
 * A point-in-time snapshot of the tracker's accumulated state.
 *
 * All token counts are real values reported by the provider (post-call),
 * not estimates. Context budget fields are present only when model metadata
 * (context window size) is available.
 */
export interface TokenSnapshot {
  /** Total prompt tokens across all recorded calls. */
  readonly totalPromptTokens: number;
  /** Total completion tokens across all recorded calls. */
  readonly totalCompletionTokens: number;
  /** Total tokens across all recorded calls. */
  readonly totalTokens: number;
  /** Number of calls recorded so far. */
  readonly callCount: number;

  /**
   * The most recent call's prompt token count.
   * This represents the current context window usage for the last call —
   * the best indicator of how full the context window is right now.
   * `undefined` if no calls have been recorded.
   */
  readonly lastPromptTokens: number | undefined;

  /**
   * Context window size in tokens, if model metadata is available.
   * `undefined` when no model metadata was provided or found in the catalog.
   */
  readonly contextWindow: number | undefined;

  /**
   * Maximum output tokens per response, if model metadata is available.
   * `undefined` when not specified in metadata.
   */
  readonly maxOutputTokens: number | undefined;

  /**
   * Percentage of the context window used by the most recent call's prompt.
   * Value between 0 and 1 (e.g., 0.75 = 75% used).
   * `undefined` when context window or last prompt token count is unavailable.
   */
  readonly contextUsagePercent: number | undefined;

  /**
   * Estimated tokens remaining in the context window based on the most
   * recent call's prompt token count.
   * `undefined` when context window or last prompt token count is unavailable.
   */
  readonly contextRemaining: number | undefined;

  /** Individual call records in chronological order. */
  readonly calls: readonly TokenUsageRecord[];
}

/**
 * A mutable token usage tracker. Accumulates real token usage from
 * `afterCallResult` hooks and provides queryable snapshots.
 *
 * Created via `createTokenTracker()` and attached to agents via `useTokenTracking()`.
 *
 * @example
 * ```ts
 * import { useTokenTracking } from "@comma-agents/core";
 *
 * const tracker = useTokenTracking(agent, { model: "openai/gpt-4o" });
 *
 * await agent.call("Hello");
 * const snapshot = tracker.snapshot();
 * console.log(`Used ${snapshot.totalTokens} tokens`);
 * console.log(`Context ${(snapshot.contextUsagePercent! * 100).toFixed(1)}% full`);
 * ```
 */
export interface TokenTracker {
  /**
   * Record a call's token usage. Called automatically by the `afterCallResult`
   * hook installed by `useTokenTracking()`.
   */
  record(promptTokens: number, completionTokens: number): void;

  /** Take a snapshot of accumulated usage. */
  snapshot(): TokenSnapshot;

  /** Clear all recorded usage data. */
  reset(): void;
}

/**
 * Configuration for `useTokenTracking()`.
 *
 * All fields are optional — when omitted, the model is auto-detected from
 * the agent's config and looked up in the built-in catalog.
 */
export interface UseTokenTrackingConfig {
  /**
   * Explicit model identifier in `"providerID/modelID"` format.
   * Overrides auto-detection from the agent's config.
   */
  readonly model?: string;

  /**
   * Explicit model metadata. When provided, overrides both auto-detection
   * and catalog lookup. Use this for models not in the catalog.
   */
  readonly modelMetadata?: ModelMetadata;
}
