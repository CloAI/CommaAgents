// Flow type definitions — the contracts for flow orchestration.

import type { Agent, AgentCallResult } from "../agents/types";
import type { CycleHooks, FlowHooks } from "../hooks/types";

// ---------------------------------------------------------------------------
// FlowStep — what a flow operates on
// ---------------------------------------------------------------------------

/**
 * A step in a flow. Since flows return `Agent`, flows compose recursively:
 * a flow can contain agents, other flows, or any mix.
 */
export type FlowStep = Agent;

// ---------------------------------------------------------------------------
// FlowResult — richer return type for flows
// ---------------------------------------------------------------------------

/**
 * Result from a flow execution. Extends `AgentCallResult` so flows
 * satisfy the `Agent.call()` contract while exposing per-step details.
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

// ---------------------------------------------------------------------------
// FlowContext — provided to custom flow executors
// ---------------------------------------------------------------------------

/**
 * Context provided to the flow executor function.
 *
 * Provides utilities for running steps (which tracks results automatically)
 * and access to flow metadata.
 */
export interface FlowContext {
  /** Name of this flow. */
  readonly name: string;
  /** AbortSignal for cancellation. */
  readonly abort?: AbortSignal;
  /**
   * Run a step (agent or nested flow) with a message.
   * Tracks the result internally for aggregation into `FlowResult`.
   *
   * @param step - The agent or flow to call.
   * @param message - The message to pass to the step.
   * @returns The step's result.
   */
  runStep(step: FlowStep, message: string): Promise<AgentCallResult>;
  /** All results collected so far (for inspection mid-flow). */
  readonly results: ReadonlyArray<AgentCallResult>;
}

// ---------------------------------------------------------------------------
// FlowExecutor — the orchestration function
// ---------------------------------------------------------------------------

/**
 * The function that defines how a flow orchestrates its steps.
 *
 * Receives the list of steps, the input message, and a context object.
 * Must return the final output text. Step results are tracked automatically
 * via `ctx.runStep()`.
 *
 * @example
 * ```ts
 * // A simple pipeline executor
 * const pipelineExecutor: FlowExecutor = async (steps, message, ctx) => {
 *   let current = message;
 *   for (const step of steps) {
 *     const result = await ctx.runStep(step, current);
 *     current = result.text;
 *   }
 *   return current;
 * };
 * ```
 */
export type FlowExecutor = (
  steps: ReadonlyArray<FlowStep>,
  message: string,
  ctx: FlowContext,
) => Promise<string>;

// ---------------------------------------------------------------------------
// FlowConfig — base configuration for all flows
// ---------------------------------------------------------------------------

/** Base configuration shared by all flow types. */
export interface FlowConfig {
  /** Unique name for this flow. */
  readonly name: string;
  /** The steps (agents/flows) this flow orchestrates. */
  readonly steps: ReadonlyArray<FlowStep>;
  /** Flow lifecycle hooks. */
  readonly hooks?: FlowHooks;
  /** AbortSignal for cancellation. */
  readonly abort?: AbortSignal;
}

// ---------------------------------------------------------------------------
// CycleFlowConfig — configuration for cycle flows
// ---------------------------------------------------------------------------

/**
 * Configuration for cycle-based flows.
 *
 * Supports finite cycles (`cycles: 3`), infinite cycles (`cycles: Infinity`
 * with an AbortSignal), and an optional observer agent that runs after
 * each cycle.
 */
export interface CycleFlowConfig extends Omit<FlowConfig, "hooks"> {
  /**
   * Number of cycle iterations.
   * Use `Infinity` for an infinite loop (requires `abort` signal).
   * @default 1
   */
  readonly cycles?: number;
  /** Cycle-specific hooks (includes per-cycle alter hooks). */
  readonly hooks?: CycleHooks;
  /**
   * Observer agent that runs after each cycle.
   * Sugar for prepending an `alterMessageAfterCycle` hook that calls
   * the observer and uses its response as the next cycle's input.
   */
  readonly observer?: Agent;
}

// ---------------------------------------------------------------------------
// BroadcastFlowConfig — configuration for broadcast flows
// ---------------------------------------------------------------------------

/** Configuration for broadcast flows. */
export interface BroadcastFlowConfig extends FlowConfig {
  /**
   * Separator used to join step responses.
   * @default "\n\n"
   */
  readonly separator?: string;
}

// ---------------------------------------------------------------------------
// CustomFlowConfig — for one-off createFlow()
// ---------------------------------------------------------------------------

/** Configuration for a one-off custom flow. */
export interface CustomFlowConfig extends FlowConfig {
  /** The orchestration function. */
  readonly execute: FlowExecutor;
}
