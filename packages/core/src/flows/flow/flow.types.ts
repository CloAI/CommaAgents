// Flow type definitions — the contracts for flow orchestration.

import type { Agent, AgentCallResult } from "../../agents/agent/agent.types";
import type { SideEffectHook, TransformHook } from "../../hooks";

// FlowHooks

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

// CycleHooks

/**
 * Additional hooks for cycle-based flows.
 */
export interface CycleHooks extends FlowHooks {
  /** Transform the message before each cycle iteration. */
  readonly alterMessageBeforeCycle?: ReadonlyArray<TransformHook<string>>;
  /** Transform the message after each cycle iteration. */
  readonly alterMessageAfterCycle?: ReadonlyArray<TransformHook<string>>;
}

// FlowResult — richer return type for flows

/**
 * Result from a flow execution. Extends `AgentCallResult` so flows
 * satisfy the `Agent.call()` contract while exposing per-step details.
 *
 * Individual step results are available via `stepResults`. For LLM-specific
 * details (response messages, AI SDK steps), narrow individual step results
 * to `LLMCallResult`.
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

// FlowContext — provided to custom flow executors

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

// FlowExecutor — the orchestration function

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

// FlowConfig — base configuration for all flows

/** Base configuration shared by all flow types. */
export interface FlowConfig {
  /** Unique name for this flow. */
  readonly name: string;
  /** The steps (agents or nested flows) this flow orchestrates. */
  readonly steps: ReadonlyArray<Agent>;
  /** Flow lifecycle hooks. */
  readonly hooks?: FlowHooks;
}

// CycleFlowConfig — configuration for cycle flows

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
  /** Cycle-specific hooks (includes per-cycle alter hooks). */
  readonly hooks?: CycleHooks;
  /**
   * Observer agent that runs after each cycle.
   * Sugar for prepending an `alterMessageAfterCycle` hook that calls
   * the observer and uses its response as the next cycle's input.
   */
  readonly observer?: Agent;
}

// BroadcastFlowConfig — configuration for broadcast flows

/** Configuration for broadcast flows. */
export interface BroadcastFlowConfig extends FlowConfig {
  /**
   * Separator used to join step responses.
   * @default "\n\n"
   */
  readonly separator?: string;
}

// CustomFlowConfig — for one-off createFlow()

/** Configuration for a one-off custom flow. */
export interface CustomFlowConfig extends FlowConfig {
  /** The orchestration function. */
  readonly execute: FlowExecutor;
}
