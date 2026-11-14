import type { SideEffectHook, TransformHook } from "../../hooks";
import type { ToolContext } from "../../tools/tool.types";
import type {
  AgentCallResult,
  AgentStreamEvent,
  AgentCallIdentity,
  AgentCallFailure,
} from "../agent/agent.types";

/**
 * Agent lifecycle hooks.
 *
 * Execution order for a call:
 *   onCallStarted → alterCallMessage → beforeCall → [execution] → onCallCompleted → afterCallResult → alterResponse
 *
 * On the first call, `*First*` variants are used if defined.
 * If a `*First*` hook is not set, the corresponding base hook is used as fallback.
 */
export interface AgentHooks {
  /** Observe every successful invocation after its conversation record exists, independent of first-call hook overrides. */
  readonly onCallCompleted?: ReadonlyArray<SideEffectHook<AgentCallResult>>;
  /** Observe invocation identity before pre-call hooks and execution. */
  readonly onCallStarted?: ReadonlyArray<SideEffectHook<AgentCallIdentity>>;
  /** Observe invocation failures with their identity and cancellation state. */
  readonly onCallFailed?: ReadonlyArray<SideEffectHook<AgentCallFailure>>;
  /** Transform the message before the first call. Falls back to `alterCallMessage`. */
  readonly alterFirstCallMessage?: ReadonlyArray<TransformHook<string>>;

  /** Transform the message before subsequent calls. */
  readonly alterCallMessage?: ReadonlyArray<TransformHook<string>>;

  /** Side-effect before the first call. Falls back to `beforeCall`. */
  readonly beforeFirstCall?: ReadonlyArray<SideEffectHook<string>>;

  /** Side-effect before subsequent calls. */
  readonly beforeCall?: ReadonlyArray<SideEffectHook<string>>;

  /**
   * Side-effect after the first call, receiving the full result including
   * token usage, finish reason, and response text. Falls back to `afterCallResult`.
   */
  readonly afterFirstCallResult?: ReadonlyArray<
    SideEffectHook<AgentCallResult>
  >;

  /**
   * Side-effect fired after the call completes, receiving the full result
   * including token usage, finish reason, and response text.
   *
   * Fires before `alterResponse`. Use this for token tracking, cost
   * estimation, analytics, logging, etc.
   */
  readonly afterCallResult?: ReadonlyArray<SideEffectHook<AgentCallResult>>;

  /** Transform the response after the first call. Falls back to `alterResponse`. */
  readonly alterFirstResponse?: ReadonlyArray<TransformHook<string>>;

  /** Transform the response after subsequent calls. */
  readonly alterResponse?: ReadonlyArray<TransformHook<string>>;

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
  /** Called before a tool is executed. */
  readonly beforeToolCall?: ReadonlyArray<
    SideEffectHook<{
      readonly name: string;
      readonly args: string;
      readonly toolContext: ToolContext;
    }>
  >;
  /** Called after a tool is executed. */
  readonly afterToolCall?: ReadonlyArray<
    SideEffectHook<{
      readonly name: string;
      readonly args: string;
      readonly result: string;
      readonly toolContext: ToolContext;
    }>
  >;
}
