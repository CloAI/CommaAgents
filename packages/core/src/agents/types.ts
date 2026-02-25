// Shared agent types — the core contracts that flows and consumers use.

import type { StepResult } from "ai";

// ---------------------------------------------------------------------------
// Agent — the polymorphic interface for flows
// ---------------------------------------------------------------------------

/**
 * The core agent contract. Any agent — LLM-backed, human-in-the-loop,
 * or custom — implements this interface. Flows operate exclusively on
 * this type, enabling composition of heterogeneous agents.
 *
 * @example
 * ```ts
 * // Flows accept any Agent
 * const flow = createSequentialFlow({
 *   name: "pipeline",
 *   agents: [llmAgent, userAgent, customAgent],
 * });
 * ```
 */
export interface Agent {
  /** Unique name for this agent. */
  readonly name: string;

  /**
   * Call the agent with a message.
   * Runs the full hook lifecycle around the core action.
   */
  call(message: string): Promise<AgentCallResult>;

  /** Reset internal state (history, first-call flag, etc.). */
  reset(): void;
}

// ---------------------------------------------------------------------------
// AgentCallResult
// ---------------------------------------------------------------------------

/** Metadata about a completed agent call. */
export interface AgentCallResult {
  /** The final text response from the agent. */
  readonly text: string;
  /** All steps taken during this call (LLM calls + tool executions). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK step generics are complex
  readonly steps: ReadonlyArray<StepResult<any>>;
  /** Total token usage across all steps. */
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
  /** Why the agent stopped (e.g., "stop", "tool-calls", "length"). */
  readonly finishReason: string;
}

// ---------------------------------------------------------------------------
// AgentStreamEvent
// ---------------------------------------------------------------------------

/** Event emitted during a streaming agent call. */
export type AgentStreamEvent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "tool-call"; readonly toolName: string; readonly args: string }
  | { readonly type: "tool-result"; readonly toolName: string; readonly output: string }
  | { readonly type: "step-start" }
  | { readonly type: "done"; readonly result: AgentCallResult };

// ---------------------------------------------------------------------------
// HookedCallResult — internal, used by withAgentHooks
// ---------------------------------------------------------------------------

/**
 * Result from the hook-wrapped call, including the altered message
 * so callers (like BaseAgent) can use it for history tracking.
 */
export interface HookedCallResult {
  /** The final agent call result (with altered response text). */
  readonly result: AgentCallResult;
  /** The message after alter-message hooks, before the core execute. */
  readonly alteredMessage: string;
}
