import type { SideEffectHook, TransformHook } from "../../hooks";
import type { AgentCallResult, AgentStreamEvent } from "../agent/agent.types";

/**
 * Agent lifecycle hooks.
 *
 * Execution order for a call:
 *   alterCallMessage → beforeCall → [LLM call] → afterCall → afterCallResult → alterResponse
 *
 * On the first call, `initial*` variants are used if defined.
 * If an `initial*` hook is not set, the corresponding base hook is used as fallback.
 */
export interface AgentHooks {
  /** Transform the message before the first LLM call. Falls back to `alterCallMessage`. */
  readonly alterInitialCallMessage?: ReadonlyArray<TransformHook<string>>;
  /** Side-effect before the first LLM call. Falls back to `beforeCall`. */
  readonly beforeInitialCall?: ReadonlyArray<SideEffectHook<string>>;
  /** Side-effect after the first LLM call. Falls back to `afterCall`. */
  readonly afterInitialCall?: ReadonlyArray<SideEffectHook<string>>;
  /** Transform the response after the first LLM call. Falls back to `alterResponse`. */
  readonly alterInitialResponse?: ReadonlyArray<TransformHook<string>>;

  /** Transform the message before subsequent LLM calls. */
  readonly alterCallMessage?: ReadonlyArray<TransformHook<string>>;
  /** Side-effect before subsequent LLM calls. */
  readonly beforeCall?: ReadonlyArray<SideEffectHook<string>>;
  /** Side-effect after subsequent LLM calls. */
  readonly afterCall?: ReadonlyArray<SideEffectHook<string>>;
  /** Transform the response after subsequent LLM calls. */
  readonly alterResponse?: ReadonlyArray<TransformHook<string>>;

  /**
   * Side-effect fired after the LLM call completes, receiving the full result
   * including token usage, finish reason, and response text.
   *
   * Fires after `afterCall` and before `alterResponse`. Unlike `afterCall`
   * (which receives only the response text), this hook receives the complete
   * `AgentCallResult` with `usage.promptTokens` and `usage.completionTokens`.
   *
   * Use this for token tracking, cost estimation, analytics, etc.
   */
  readonly afterCallResult?: ReadonlyArray<SideEffectHook<AgentCallResult>>;

  /**
   * Called for each streaming event during an agent's LLM call.
   * Fires when `agent.stream()` is called directly.
   */
  readonly onStreamEvent?: ReadonlyArray<SideEffectHook<AgentStreamEvent>>;
}

// ToolHooks

/**
 * Tool lifecycle hooks.
 *
 * Executed around each individual tool invocation within an agent call.
 */
export interface ToolHooks {
  /** Called before a tool is executed. Receives tool name and stringified args. */
  readonly beforeToolCall?: ReadonlyArray<
    SideEffectHook<{ readonly name: string; readonly args: string }>
  >;
  /** Called after a tool is executed. Receives tool name, args, and result. */
  readonly afterToolCall?: ReadonlyArray<
    SideEffectHook<{
      readonly name: string;
      readonly args: string;
      readonly result: string;
    }>
  >;
}
