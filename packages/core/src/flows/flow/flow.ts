// Flow factories — the core flow API.
//
// buildFlowAgent() is the workhorse: takes a config + executor, returns an Agent.
// createFlow() is the public one-off API (sugar over buildFlowAgent).

import type { Agent } from "../../agents/agent/agent.types";
import { FlowExecutionError } from "../../errors/index";
import { runSideEffectHooks, runTransformHooks } from "../../hooks/types";
import type {
  CustomFlowConfig,
  FlowConfig,
  FlowExecutor,
  FlowHooks,
  FlowResult,
} from "./flow.types";
import { buildFlowResult, createFlowContext } from "./flow.utils";

/**
 * Mutable hook store backed by a hooks interface `H`.
 *
 * Removes the `readonly` modifier from property keys so values can be
 * reassigned (replace-on-append), while preserving the original array
 * types so no casts are needed when reading hooks.
 *
 * @example
 * ```ts
 * const store: HookStore<FlowHooks> = { ...config.hooks };
 * // store.beforeFlow is ReadonlyArray<SideEffectHook<string>> | undefined — typed correctly
 * // store.beforeFlow = [...(store.beforeFlow ?? []), newHook]; — assignable
 * ```
 */
export type HookStore<H extends FlowHooks = FlowHooks> = { -readonly [K in keyof H]: H[K] };

// buildFlowAgent — the workhorse

/**
 * Build an `Agent` from a flow config, a hooks store, and an executor.
 *
 * This is the shared foundation for all flow types. It:
 * 1. Validates that steps are non-empty.
 * 2. Creates a `FlowContext` per call (tracks step results, fires step hooks).
 * 3. Runs the flow-level hook lifecycle around the executor.
 * 4. Returns an `Agent` with `name`, `call`, `reset`, and internal `appendHook`.
 *
 * The `store` is read on each call, so hooks appended via `appendHook` take
 * effect on subsequent calls.
 *
 * @param config - Flow configuration (name, steps, abort).
 * @param typeName - Identifier for this flow type (for error messages).
 * @param store - Hooks store (typically `{ ...config.hooks }`).
 * @param executor - The orchestration function that defines step execution order.
 * @param onReset - Optional callback fired after steps are reset (e.g. for observer cleanup).
 * @returns An `Agent` implementing the flow.
 *
 * @example
 * ```ts
 * const agent = buildFlowAgent(
 *   config,
 *   "pipeline",
 *   { ...config.hooks },
 *   async (steps, message, ctx) => {
 *     let current = message;
 *     for (const step of steps) {
 *       const r = await ctx.runStep(step, current);
 *       current = r.text;
 *     }
 *     return current;
 *   },
 * );
 * ```
 */
export function buildFlowAgent<H extends FlowHooks = FlowHooks>(
  config: FlowConfig,
  typeName: string,
  store: HookStore<H>,
  executor: FlowExecutor,
  onReset?: () => void,
): Agent {
  if (config.steps.length === 0) {
    throw new FlowExecutionError(config.name, `${typeName} flow requires at least one step`);
  }

  // The store is typed as HookStore<H> which extends FlowHooks, so
  // flow-level hooks (beforeFlow, afterFlow, etc.) are accessible directly.
  // For sub-type hooks (e.g. CycleHooks' alterMessageBeforeCycle), the
  // executor reads from the store directly with full type safety.
  const hooks: HookStore<H> = store;

  const agent = {
    name: config.name,

    async call(message: string): Promise<FlowResult> {
      // 1. Alter message before flow
      const alteredMessage = await runTransformHooks(hooks.alterMessageBeforeFlow, message);

      // 2. Before flow (side-effect)
      await runSideEffectHooks(hooks.beforeFlow, alteredMessage);

      // 3. Execute the flow
      const ctx = createFlowContext(config.name, config.abort, hooks);
      const text = await executor(config.steps, alteredMessage, ctx);
      const result = buildFlowResult(text, ctx.results);

      // 4. After flow (side-effect)
      await runSideEffectHooks(hooks.afterFlow, result.text);

      // 5. Alter message after flow
      const alteredText = await runTransformHooks(hooks.alterMessageAfterFlow, result.text);

      return { ...result, text: alteredText };
    },

    reset(): void {
      for (const step of config.steps) {
        step.reset();
      }
      onReset?.();
    },

    /** Append a hook callback to this flow's lifecycle. */
    appendHook(hookName: string, callback: unknown): void {
      const key = hookName as keyof H;
      const existing = (store[key] ?? []) as readonly unknown[];
      (store as Record<string, unknown>)[hookName] = [...existing, callback];
    },
  };

  return agent;
}

// createFlow — one-off custom flow

/**
 * Create a one-off custom flow with inline orchestration logic.
 *
 * For reusable flow types, use `buildFlowAgent()` directly.
 *
 * @param config - Flow configuration including the `execute` function.
 * @returns An `Agent` implementing the custom flow.
 *
 * @example
 * ```ts
 * const flow = createFlow({
 *   name: "my-custom",
 *   steps: [agentA, agentB],
 *   execute: async (steps, message, ctx) => {
 *     const r1 = await ctx.runStep(steps[0], message);
 *     if (r1.text.includes("DONE")) return r1.text;
 *     const r2 = await ctx.runStep(steps[1], r1.text);
 *     return r2.text;
 *   },
 * });
 * ```
 */
export function createFlow(config: CustomFlowConfig): Agent {
  return buildFlowAgent(config, "custom", { ...config.hooks }, config.execute);
}
