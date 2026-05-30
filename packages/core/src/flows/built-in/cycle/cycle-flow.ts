// createCycleFlow — repeating pipeline with cycle hooks and observer support.
//
// Supports:
// - Finite cycles: cycles: 3 (run the pipeline 3 times)
// - Infinite cycles: cycles: Infinity (runs until externally cancelled)
// - Observer: agent runs after each cycle's steps; can break loop with signals
// - Cycle hooks: alterMessageBeforeCycle / alterMessageAfterCycle
// - Break signals: observer output containing "end cycle", "stop", "done"
//   (case-insensitive substring by default) breaks the cycle and returns
//   the step output. Strategy authors can override both the signal set
//   and the match strategy (substring / first-line / any-line / exact).
//
// Built on buildFlowAgent().

import type { Agent } from "../../../agents/agent/agent.types";
import { runTransformHooks } from "../../../hooks";
import type { HookStore } from "../../flow/flow";
import { buildFlowAgent } from "../../flow/flow";
import type { CycleFlowConfig, CycleHooks } from "../../flow/flow.types";

/**
 * Check whether `observerOutput` contains any of the break signals
 * under the chosen matching mode.
 *
 * Exposed for tests; not part of the public API.
 *
 * @internal
 */
export function matchesBreakSignal(
  observerOutput: string,
  signals: ReadonlyArray<string>,
  mode: "substring" | "first-line" | "any-line" | "exact",
): boolean {
  const lowerOutput = observerOutput.toLowerCase();
  const lowerSignals = signals.map((signal) => signal.toLowerCase());
  const matchesLineSignal = (line: string) =>
    lowerSignals.some(
      (signal) =>
        line === signal ||
        (line.startsWith(signal) &&
          /\s/.test(line.charAt(signal.length) ?? "")),
    );

  switch (mode) {
    case "substring": {
      // Legacy behaviour — case-insensitive substring anywhere. Prone
      // to false positives on verbose observers (e.g. "not done yet"
      // matches "done"); kept as default for backwards compatibility.
      return lowerSignals.some((signal) => lowerOutput.includes(signal));
    }

    case "exact": {
      const trimmed = lowerOutput.trim();
      return lowerSignals.includes(trimmed);
    }

    case "first-line": {
      // Walk to the first non-blank line and compare its verdict prefix.
      const lines = lowerOutput.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        return matchesLineSignal(trimmed);
      }
      return false;
    }

    case "any-line": {
      const lines = lowerOutput.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        if (matchesLineSignal(trimmed)) return true;
      }
      return false;
    }
  }
}

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
 *   If the observer's response matches a break signal under the
 *   configured match strategy (`breakCycleSignalMatch`), the cycle
 *   breaks and returns the step output (before the observer ran).
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
 * // Infinite refine-until-good with a unique unambiguous break token.
 * // First-line match means the reviewer's verdict is on line 1, with
 * // optional reasoning below — and casual prose like "not done yet"
 * // in the CONTINUE branch cannot accidentally trigger the break.
 * const flow = createCycleFlow({
 *   name: "refine-loop",
 *   steps: [writer],
 *   cycles: Infinity,
 *   observer: critic,
 *   breakCycleSignals: ["==CYCLE_DONE=="],
 *   breakCycleSignalMatch: "first-line",
 * });
 * ```
 */
export function createCycleFlow(config: CycleFlowConfig): Agent {
  const cycles = config.cycles ?? 1;
  const breakSignals = config.breakCycleSignals ?? [
    "end cycle",
    "stop",
    "done",
  ];
  const matchMode = config.breakCycleSignalMatch ?? "substring";

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

          if (matchesBreakSignal(observerOutput, breakSignals, matchMode)) {
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
