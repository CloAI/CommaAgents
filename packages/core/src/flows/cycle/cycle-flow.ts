// createCycleFlow — repeating pipeline with cycle hooks and observer support.
//
// Supports:
// - Finite cycles: cycles: 3 (run the pipeline 3 times)
// - Infinite cycles: cycles: Infinity (requires abort signal)
// - Observer: observer agent runs after each cycle (sugar for alterMessageAfterCycle)
// - Cycle hooks: alterMessageBeforeCycle / alterMessageAfterCycle
//
// Cannot use defineFlow() directly because CycleFlow has its own config type
// and cycle-specific hook handling. Uses the same building blocks though.

import type { Agent, AgentCallResult } from "../../agents/types";
import { FlowExecutionError } from "../../errors/index";
import type { CycleHooks } from "../../hooks/types";
import { runTransformHooks } from "../../hooks/types";
import { buildFlowResult, createFlowContext } from "../define-flow";
import { withFlowHooks } from "../flow-hooks";
import type { CycleFlowConfig, FlowResult } from "../types";

// ---------------------------------------------------------------------------
// createCycleFlow
// ---------------------------------------------------------------------------

/**
 * Create a cycle flow that repeats a sequential pipeline N times.
 *
 * Each cycle runs all steps in sequence. The output of one cycle
 * becomes the input of the next. Supports:
 *
 * - **Finite cycles**: `cycles: 3` runs the pipeline 3 times.
 * - **Infinite cycles**: `cycles: Infinity` runs until the `abort` signal fires.
 * - **Observer**: An agent that processes each cycle's output before
 *   the next cycle begins (sugar for `alterMessageAfterCycle` hook).
 * - **Cycle hooks**: `alterMessageBeforeCycle` / `alterMessageAfterCycle`
 *   transform the message at cycle boundaries.
 *
 * @param config - Cycle flow configuration.
 * @returns An `Agent` implementing the cycle flow.
 *
 * @example
 * ```ts
 * // Finite: run reviewer 3 times
 * const flow = createCycleFlow({
 *   name: "review-loop",
 *   steps: [writer, reviewer],
 *   cycles: 3,
 * });
 *
 * // Infinite: run until aborted
 * const controller = new AbortController();
 * const flow = createCycleFlow({
 *   name: "chat-loop",
 *   steps: [userAgent, assistant],
 *   cycles: Infinity,
 *   abort: controller.signal,
 * });
 *
 * // Observer: critic reviews each cycle's output
 * const flow = createCycleFlow({
 *   name: "refine-loop",
 *   steps: [writer],
 *   cycles: 3,
 *   observer: critic,
 * });
 * ```
 */
export function createCycleFlow(config: CycleFlowConfig): Agent {
  const cycles = config.cycles ?? 1;

  if (config.steps.length === 0) {
    throw new FlowExecutionError(config.name, "cycle flow requires at least one step");
  }

  if (cycles === Infinity && !config.abort) {
    throw new FlowExecutionError(
      config.name,
      "Infinite cycle flow requires an abort signal. Pass `abort` in config.",
    );
  }

  // Build the effective alterMessageAfterCycle hooks.
  // If observer is provided, prepend it as the first hook.
  const effectiveAfterCycleHooks = buildAfterCycleHooks(config);

  // The core cycle execution — wrapped by withFlowHooks for flow-level hooks
  const coreExecute = async (message: string): Promise<FlowResult> => {
    const ctx = createFlowContext(config.name, config.abort, config.hooks);
    let current = message;

    for (let cycle = 0; cycle < cycles; cycle++) {
      // Yield to the event loop between cycles so that abort signals
      // scheduled via setTimeout (or other macrotasks) get a chance to fire.
      // Without this, an infinite cycle with synchronously-resolving agents
      // would monopolize the microtask queue and never check abort.
      if (cycle > 0) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }

      // Check abort before each cycle
      if (config.abort?.aborted) {
        break;
      }

      // Cycle pre-hooks: alterMessageBeforeCycle
      current = await runTransformHooks(config.hooks?.alterMessageBeforeCycle, current);

      // Run all steps sequentially within this cycle
      for (const step of config.steps) {
        const result = await ctx.runStep(step, current);
        current = result.text;
      }

      // Cycle post-hooks: alterMessageAfterCycle (includes observer if configured)
      current = await runTransformHooks(effectiveAfterCycleHooks, current);
    }

    return buildFlowResult(current, ctx.results);
  };

  // Wrap with flow-level hooks
  const hookedExecute = withFlowHooks(config.hooks, coreExecute);

  return {
    name: config.name,

    async call(message: string): Promise<FlowResult> {
      return hookedExecute(message);
    },

    reset(): void {
      for (const step of config.steps) {
        step.reset();
      }
      config.observer?.reset();
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the effective alterMessageAfterCycle hook array.
 *
 * If an observer agent is provided, it is prepended as the first hook
 * (matching the Python CycleObserverFlow behavior — observer runs before
 * user-provided after-cycle hooks).
 */
function buildAfterCycleHooks(config: CycleFlowConfig): CycleHooks["alterMessageAfterCycle"] {
  const userHooks = config.hooks?.alterMessageAfterCycle ?? [];

  if (!config.observer) {
    return userHooks.length > 0 ? userHooks : undefined;
  }

  // Observer hook: call the observer agent and use its response
  const observerHook = async (message: string): Promise<string> => {
    const result = await config.observer!.call(message);
    return result.text;
  };

  return [observerHook, ...userHooks];
}
