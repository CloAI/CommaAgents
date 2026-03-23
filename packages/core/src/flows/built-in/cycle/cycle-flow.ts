// createCycleFlow — repeating pipeline with cycle hooks and observer support.
//
// Supports:
// - Finite cycles: cycles: 3 (run the pipeline 3 times)
// - Infinite cycles: cycles: Infinity (requires abort signal)
// - Observer: observer agent runs after each cycle (sugar for alterMessageAfterCycle)
// - Cycle hooks: alterMessageBeforeCycle / alterMessageAfterCycle
//
// Built on buildFlowAgent().

import type { Agent } from "../../../agents/agent/agent.types";
import { FlowExecutionError } from "../../../errors/index";
import type { TransformHook } from "../../../hooks/types";
import { runTransformHooks } from "../../../hooks/types";
import type { HookStore } from "../../flow/flow";
import { buildFlowAgent } from "../../flow/flow";
import type { CycleFlowConfig, CycleHooks } from "../../flow/flow.types";

// createCycleFlow

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

  if (cycles === Infinity && !config.abort) {
    throw new FlowExecutionError(
      config.name,
      "Infinite cycle flow requires an abort signal. Pass `abort` in config.",
    );
  }

  // Shallow copy of config hooks — the store is read by the executor on each
  // cycle, so hooks appended via hookIntoFlow take effect on subsequent calls.
  const store: HookStore<CycleHooks> = { ...config.hooks };

  // If observer is provided, prepend it as the first alterMessageAfterCycle hook.
  if (config.observer) {
    const observerHook: TransformHook<string> = async (message: string): Promise<string> => {
      const result = await config.observer!.call(message);
      return result.text;
    };
    const existing = store.alterMessageAfterCycle ?? [];
    store.alterMessageAfterCycle = [observerHook, ...existing];
  }

  return buildFlowAgent(
    config,
    "cycle",
    store,
    async (steps, message, ctx) => {
      let current = message;

      for (let cycle = 0; cycle < cycles; cycle++) {
        // Yield to the event loop between cycles so that abort signals
        // scheduled via setTimeout (or other macrotasks) get a chance to fire.
        if (cycle > 0) {
          await new Promise<void>((r) => setTimeout(r, 0));
        }

        // Check abort before each cycle
        if (config.abort?.aborted) {
          break;
        }

        // Cycle pre-hooks: alterMessageBeforeCycle (reads from mutable store)
        current = await runTransformHooks(store.alterMessageBeforeCycle, current);

        // Run all steps sequentially within this cycle
        for (const step of steps) {
          const result = await ctx.runStep(step, current);
          current = result.text;
        }

        // Cycle post-hooks: alterMessageAfterCycle (reads from mutable store)
        current = await runTransformHooks(store.alterMessageAfterCycle, current);
      }

      return current;
    },
    // Reset observer alongside steps
    () => config.observer?.reset(),
  );
}
