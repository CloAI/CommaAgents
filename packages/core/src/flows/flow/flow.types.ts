import type { Agent, AgentCallResult } from "../../agents/agent/agent.types";
import type { SideEffectHook, TransformHook } from "../../hooks";

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
 * Result from a flow execution. Extends `AgentCallResult` with
 * per-step details and aggregated token usage.
 *
 * Individual step results are available via `stepResults`.
 *
 * @example
 * ```ts
 * const result = await flow.call("hello") as FlowResult;
 * console.log(result.text);             // final flow output
 * console.log(result.stepResults[0]);   // first step's result
 * console.log(result.usage);            // aggregated token usage
 * ```
 */
export interface FlowResult extends AgentCallResult {
  /** Results from each step execution, in the order they ran. */
  readonly stepResults: ReadonlyArray<AgentCallResult>;
}

/**
 * Context provided to the flow executor function.
 *
 * Provides utilities for running steps (which tracks results automatically)
 * and access to flow metadata.
 */
export interface FlowContext {
  /** Name of this flow. */
  readonly name: string;
  /**
   * Run a step (agent or nested flow) with a message.
   * Tracks the result internally for aggregation into `FlowResult`.
   *
   * @param step - The agent or nested flow to call.
   * @param message - The message to pass to the step.
   * @returns The step's result.
   */
  runStep(step: Agent, message: string): Promise<AgentCallResult>;
  /** All results collected so far (for inspection mid-flow). */
  readonly results: ReadonlyArray<AgentCallResult>;
}

/**
 * The function that defines how a flow orchestrates its steps.
 *
 * Receives the list of steps, the input message, and a context object.
 * Must return the final output text. Step results are tracked automatically
 * via `flowContext.runStep()`.
 *
 * @example
 * ```ts
 * // A simple pipeline executor
 * const pipelineExecutor: FlowExecutor = async (steps, message, flowContext) => {
 *   let current = message;
 *   for (const step of steps) {
 *     const result = await flowContext.runStep(step, current);
 *     current = result.text;
 *   }
 *   return current;
 * };
 * ```
 */
export type FlowExecutor = (
  steps: ReadonlyArray<Agent>,
  message: string,
  flowContext: FlowContext,
) => Promise<string>;

/** Base configuration shared by all flow types. */
export interface FlowConfig {
  /** Unique name for this flow. */
  readonly name: string;
  /** The steps (agents or nested flows) this flow orchestrates. */
  readonly steps: ReadonlyArray<Agent>;
}

/**
 * Configuration for cycle-based flows.
 *
 * Supports finite cycles (`cycles: 3`), infinite cycles (`cycles: Infinity`),
 * and an optional observer agent that runs after each cycle.
 */
export interface CycleFlowConfig extends FlowConfig {
  /**
   * Number of cycle iterations.
   * Use `Infinity` for an infinite loop (requires `abort` signal).
   * @default 1
   */
  readonly cycles?: number;
  /**
   * Observer agent that runs after each cycle's steps.
   * The observer's output becomes the input for the next cycle,
   * unless a break signal is detected.
   */
  readonly observer?: Agent;
  /**
   * Keywords that cause the observer to break the cycle loop. Matched
   * against the observer's textual output using {@link breakCycleSignalMatch}.
   *
   * Pick tokens unlikely to appear by accident — `"==CYCLE_DONE=="` is
   * far safer than `"done"`, which appears in casual prose like
   * `"not done yet"` and false-fires the cycle.
   *
   * @default ["end cycle", "stop", "done"]
   */
  readonly breakCycleSignals?: ReadonlyArray<string>;
  /**
   * Strategy used to compare the observer's output against the break
   * signals.
   *
   * - `"substring"` (default, legacy): the observer output (lowercased)
   *   contains the signal (lowercased) anywhere. Permissive — `"done"`
   *   matches `"not done yet"`. Backward compatible with existing
   *   strategies; brittle for verbose observers.
   * - `"first-line"`: the first non-blank line of the observer output
   *   (after trim) equals the signal or starts with the signal followed
   *   by whitespace. Recommended for LLM observers that emit a verdict
   *   on line 1 and optional reasoning below. Case-insensitive.
   * - `"any-line"`: any line of the observer output (after trim) equals
   *   the signal or starts with the signal followed by whitespace.
   *   Case-insensitive. Looser than `"first-line"`; useful when the
   *   verdict isn't pinned to line 1.
   * - `"exact"`: the entire observer output (after trim) equals the
   *   signal. The strictest mode — the observer must output **only** the
   *   signal token, nothing else. Use with tokens like `"DONE"` when
   *   you want zero false positives.
   *
   * Matching is case-insensitive in every mode except `"exact"` (which
   * is also case-insensitive — use a distinctive token if case matters).
   *
   * @default "substring"
   */
  readonly breakCycleSignalMatch?:
    | "substring"
    | "first-line"
    | "any-line"
    | "exact";
}

/** Configuration for broadcast flows. */
export interface BroadcastFlowConfig extends FlowConfig {
  /**
   * Separator used to join step responses.
   * @default "\n\n"
   */
  readonly separator?: string;
}

/** Configuration for a one-off custom flow. */
export interface CustomFlowConfig extends FlowConfig {
  /** The orchestration function. */
  readonly execute: FlowExecutor;
}
