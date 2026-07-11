import { createAbortablePromise } from "../../abortable";
import type { Agent } from "../../agents/agent/agent.types";
import { FlowExecutionError } from "../../errors/index";
import { runSideEffectHooks, runTransformHooks } from "../../hooks";
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
 * const store: HookStore<FlowHooks> = {};
 * // store.beforeFlow is ReadonlyArray<SideEffectHook<string>> | undefined — typed correctly
 * // store.beforeFlow = [...(store.beforeFlow ?? []), newHook]; — assignable
 * ```
 */
export type HookStore<HookType extends FlowHooks = FlowHooks> = {
  -readonly [HookKey in keyof HookType]: HookType[HookKey];
};

/**
 * Create a reusable flow from a step configuration and orchestration function.
 * Step calls made through the provided context are included in the final flow result.
 *
 * @param config - Flow name and the agents or nested flows it can run.
 * @param typeName - Flow type name used when reporting configuration errors.
 * @param store - Hook collection for this flow. Pass an empty object for standard flow hooks.
 * @param executor - Function that chooses which steps run and what input each receives.
 * @param onReset - Optional cleanup called after every configured step is reset.
 * @returns An agent-compatible flow that can be called, reset, and hooked.
 *
 * @example
 * ```ts
 * const flow = buildFlowAgent(
 *   config,
 *   "pipeline",
 *   {},
 *   async (steps, message, context) => {
 *     let currentMessage = message;
 *     for (const step of steps) {
 *       const result = await context.runStep(step, currentMessage);
 *       currentMessage = result.text;
 *     }
 *     return currentMessage;
 *   },
 * );
 * ```
 */
export function buildFlowAgent<HookType extends FlowHooks = FlowHooks>(
  config: FlowConfig,
  typeName: string,
  store: HookStore<HookType>,
  executor: FlowExecutor,
  onReset?: () => void,
): Agent {
  if (config.steps.length === 0) {
    throw new FlowExecutionError(
      config.name,
      `${typeName} flow requires at least one step`,
    );
  }

  // The store is typed as HookStore<H> which extends FlowHooks, so
  // flow-level hooks (beforeFlow, afterFlow, etc.) are accessible directly.
  // For sub-type hooks (e.g. CycleHooks' alterMessageBeforeCycle), the
  // executor reads from the store directly with full type safety.
  const hooks: HookStore<HookType> = store;

  const agent = {
    name: config.name,

    call(message: string) {
      return createAbortablePromise(async (signal): Promise<FlowResult> => {
        // 1. Alter message before flow
        const alteredMessage = await runTransformHooks(
          hooks.alterMessageBeforeFlow,
          message,
        );
        signal.throwIfAborted();

        // 2. Before flow (side-effect)
        await runSideEffectHooks(hooks.beforeFlow, alteredMessage);
        signal.throwIfAborted();

        // 3. Execute the flow
        const flowContext = createFlowContext(config.name, hooks, signal);
        const text = await executor(config.steps, alteredMessage, flowContext);
        signal.throwIfAborted();
        const result = buildFlowResult(text, flowContext.results);

        // 4. After flow (side-effect)
        await runSideEffectHooks(hooks.afterFlow, result.text);
        signal.throwIfAborted();

        // 5. Alter message after flow
        const alteredText = await runTransformHooks(
          hooks.alterMessageAfterFlow,
          result.text,
        );
        signal.throwIfAborted();

        return { ...result, text: alteredText };
      });
    },

    reset(): void {
      for (const step of config.steps) {
        step.reset();
      }
      onReset?.();
    },

    /** Append a hook callback to this flow's lifecycle. */
    appendHook(hookName: string, callback: unknown): void {
      const key = hookName as keyof HookType;
      const existing = (store[key] ?? []) as readonly unknown[];
      (store as Record<string, unknown>)[hookName] = [...existing, callback];
    },
  };

  return agent;
}

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
 *   execute: async (steps, message, context) => {
 *     const firstResult = await context.runStep(steps[0], message);
 *     if (firstResult.text.includes("DONE")) return firstResult.text;
 *     const secondResult = await context.runStep(steps[1], firstResult.text);
 *     return secondResult.text;
 *   },
 * });
 * ```
 */
export function createFlow(config: CustomFlowConfig): Agent {
  return buildFlowAgent(config, "custom", {}, config.execute);
}
