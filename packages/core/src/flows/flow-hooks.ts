// Flow hook lifecycle middleware.
//
// Mirrors withAgentHooks() — wraps a flow's execute function with the
// flow hook lifecycle:
//   alterMessageBeforeFlow → beforeFlow → [execute] → afterFlow → alterMessageAfterFlow

import type { FlowHooks } from "../hooks/types";
import { runSideEffectHooks, runTransformHooks } from "../hooks/types";
import type { FlowResult } from "./types";

// ---------------------------------------------------------------------------
// withFlowHooks — the main middleware
// ---------------------------------------------------------------------------

/**
 * Wrap a flow execute function with the flow hook lifecycle.
 *
 * Returns a function that, given a message, runs:
 *   alterMessageBeforeFlow → beforeFlow → execute → afterFlow → alterMessageAfterFlow
 *
 * The `FlowResult.text` is replaced with the alter-response output.
 *
 * @param hooks - Flow lifecycle hooks (may be undefined for no-op).
 * @param executeFn - The core flow orchestration function.
 * @returns A function `(message) => Promise<FlowResult>`.
 *
 * @example
 * ```ts
 * const hooked = withFlowHooks(config.hooks, async (msg) => {
 *   // orchestration logic
 *   return { text: "result", steps: [], usage: { ... }, finishReason: "stop", stepResults: [] };
 * });
 *
 * const result = await hooked("hello");
 * ```
 */
export function withFlowHooks(
  hooks: FlowHooks | undefined,
  executeFn: (message: string) => Promise<FlowResult>,
): (message: string) => Promise<FlowResult> {
  return async (message: string): Promise<FlowResult> => {
    // 1. Alter message before flow
    const alteredMessage = await runTransformHooks(hooks?.alterMessageBeforeFlow, message);

    // 2. Before flow (side-effect)
    await runSideEffectHooks(hooks?.beforeFlow, alteredMessage);

    // 3. Execute the flow
    const result = await executeFn(alteredMessage);

    // 4. After flow (side-effect)
    await runSideEffectHooks(hooks?.afterFlow, result.text);

    // 5. Alter message after flow
    const alteredText = await runTransformHooks(hooks?.alterMessageAfterFlow, result.text);

    return { ...result, text: alteredText };
  };
}
