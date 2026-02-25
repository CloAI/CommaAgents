// Hook type definitions for agents, flows, and tools

import type { AgentCallResult, AgentStreamEvent } from "../agents/types";

/**
 * A side-effect hook that receives context but does not transform values.
 * Used for logging, metrics, state management, etc.
 */
export type SideEffectHook<T> = (value: T) => void | Promise<void>;

/**
 * A transform hook that receives a value and returns a (possibly modified) value.
 * Used for altering messages, responses, etc. The output of one hook becomes
 * the input of the next (chained).
 */
export type TransformHook<T> = (value: T) => T | Promise<T>;

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

/**
 * Flow lifecycle hooks.
 *
 * Execution order:
 *   alterMessageBeforeFlow → beforeFlow → [execute steps] → afterFlow → alterMessageAfterFlow
 *
 * Per-step hooks fire inside each step execution:
 *   beforeStep → [step.call()] → afterStep
 */
export interface FlowHooks {
  /** Transform the message before the flow starts. */
  readonly alterMessageBeforeFlow?: ReadonlyArray<TransformHook<string>>;
  /** Side-effect before the flow starts. */
  readonly beforeFlow?: ReadonlyArray<SideEffectHook<string>>;
  /** Side-effect after the flow completes. */
  readonly afterFlow?: ReadonlyArray<SideEffectHook<string>>;
  /** Transform the final message after the flow completes. */
  readonly alterMessageAfterFlow?: ReadonlyArray<TransformHook<string>>;

  /** Side-effect before each step runs within the flow. */
  readonly beforeStep?: ReadonlyArray<
    SideEffectHook<{ readonly stepName: string; readonly message: string }>
  >;
  /** Side-effect after each step completes within the flow. */
  readonly afterStep?: ReadonlyArray<
    SideEffectHook<{
      readonly stepName: string;
      readonly message: string;
      readonly result: AgentCallResult;
    }>
  >;
}

/**
 * Additional hooks for cycle-based flows.
 */
export interface CycleHooks extends FlowHooks {
  /** Transform the message before each cycle iteration. */
  readonly alterMessageBeforeCycle?: ReadonlyArray<TransformHook<string>>;
  /** Transform the message after each cycle iteration. */
  readonly alterMessageAfterCycle?: ReadonlyArray<TransformHook<string>>;
}

/**
 * Execute an array of side-effect hooks in order.
 */
export async function runSideEffectHooks<T>(
  hooks: ReadonlyArray<SideEffectHook<T>> | undefined,
  value: T,
): Promise<void> {
  if (!hooks) return;
  for (const hook of hooks) {
    await hook(value);
  }
}

/**
 * Execute an array of transform hooks in order, chaining outputs.
 * Returns the final transformed value.
 */
export async function runTransformHooks<T>(
  hooks: ReadonlyArray<TransformHook<T>> | undefined,
  value: T,
): Promise<T> {
  if (!hooks) return value;
  let current = value;
  for (const hook of hooks) {
    current = await hook(current);
  }
  return current;
}
