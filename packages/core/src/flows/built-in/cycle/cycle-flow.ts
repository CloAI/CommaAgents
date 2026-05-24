// createCycleFlow — repeating pipeline with cycle hooks and observer support.
//
// Supports:
// - Finite cycles: cycles: 3 (run the pipeline 3 times)
// - Infinite cycles: cycles: Infinity (runs until externally cancelled)
// - Observer: agent runs after each cycle's steps; can break loop with signals
// - Cycle hooks: alterMessageBeforeCycle / alterMessageAfterCycle
// - Break signals: observer output containing "end cycle", "stop", "done"
//   (case-insensitive) breaks the cycle and returns the step output
//
// Built on buildFlowAgent().

import type { Agent } from "../../../agents/agent/agent.types";
import { runTransformHooks } from "../../../hooks";
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
 * - **Infinite cycles**: `cycles: Infinity` runs until externally cancelled.
 * - **Observer**: An agent that processes each cycle's step output.
 *   If the observer's response contains a break signal ("end cycle",
 *   "stop", "done" by default), the cycle breaks and returns the
 *   step output (before the observer ran).
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
 * // Observer with break signal support
 * const flow = createCycleFlow({
 *   name: "refine-loop",
 *   steps: [writer],
 *   cycles: Infinity,
 *   observer: critic,
 * });
 * // critic can respond with "done" or "end cycle" to break
 * ```
 */
export function createCycleFlow(config: CycleFlowConfig): Agent {
  const cycles = config.cycles ?? 1;
  const breakSignals = config.breakCycleSignals ?? [
    "end cycle",
    "stop",
    "done",
  ];

  // Empty hook store — hooks are attached via hookIntoFlow after creation.
  // The store is read by the executor on each cycle, so hooks appended
  // via hookIntoFlow take effect on subsequent calls.
  const store: HookStore<CycleHooks> = {};

  return buildFlowAgent(
    config,
    "cycle",
    store,
    async (steps, message, flowContext) => {
      let current = message;

      for (let cycle = 0; cycle < cycles; cycle++) {
        // Yield to the event loop between cycles so that abort signals
        // scheduled via setTimeout (or other macrotasks) get a chance to fire.
        if (cycle > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }

        // Cycle pre-hooks: alterMessageBeforeCycle (reads from mutable store)
        current = await runTransformHooks(
          store.alterMessageBeforeCycle,
          current,
        );

        // Run all steps sequentially within this cycle
        for (const step of steps) {
          const result = await flowContext.runStep(step, current);
          current = result.text;
        }

        // Inline observer handling (not a hook — allows break control)
        if (config.observer) {
          const observerResult = await config.observer.call(current);
          const observerOutput = observerResult.text;

          const hasBreakSignal = breakSignals.some((signal) =>
            observerOutput.toLowerCase().includes(signal.toLowerCase()),
          );

          if (hasBreakSignal) {
            return current; // Return step output, not observer output
          }

          current = observerOutput;
        }

        // Cycle post-hooks: alterMessageAfterCycle (reads from mutable store)
        current = await runTransformHooks(
          store.alterMessageAfterCycle,
          current,
        );
      }

      return current;
    },
    () => config.observer?.reset(),
  );
}
