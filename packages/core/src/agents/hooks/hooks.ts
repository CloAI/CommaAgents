// Agent hook types and lifecycle middleware.
//
// AgentHooks and ToolHooks live here — co-located with the agent code that
// uses them. The generic hook runners (runSideEffectHooks, runTransformHooks)
// remain in hooks/types.ts as shared infrastructure.

import type { SideEffectHook, TransformHook } from "../../hooks/types";
import type { AgentStreamEvent } from "../agent/agent.types";

// AgentHooks

/**
 * Agent lifecycle hooks.
 *
 * Execution order for a call:
 *   alterCallMessage → beforeCall → [LLM call] → afterCall → alterResponse
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
   * Called for each streaming event during an agent's LLM call.
   * Fires when `stream: true` is set on the agent config, including
   * when flows call `agent.call()` (internal streaming path) and
   * when `agent.stream()` is called directly.
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

// Hook resolution

/**
 * Resolve hooks for a given lifecycle point, handling initial vs regular
 * selection with fallback.
 *
 * On the first call (`isFirst = true`), the initial variant is preferred.
 * If not defined, falls back to the regular variant.
 * On subsequent calls, the regular variant is always used.
 */
export function resolveHook<T>(
  initialHooks: ReadonlyArray<T> | undefined,
  regularHooks: ReadonlyArray<T> | undefined,
  isFirst: boolean,
): ReadonlyArray<T> | undefined {
  if (isFirst) {
    return initialHooks ?? regularHooks;
  }
  return regularHooks;
}
