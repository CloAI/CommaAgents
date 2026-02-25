// defineFlow / createFlow — the core flow API.
//
// defineFlow() creates reusable flow type factories.
// createFlow() creates one-off custom flows.
// Both return Agent, enabling recursive composition.

import type { StepResult } from "ai";
import type { Agent, AgentCallResult } from "../agents/types";
import { FlowExecutionError } from "../errors/index";
import type { FlowHooks } from "../hooks/types";
import { runSideEffectHooks } from "../hooks/types";
import { withFlowHooks } from "./flow-hooks";
import type {
  CustomFlowConfig,
  FlowConfig,
  FlowContext,
  FlowExecutor,
  FlowResult,
  FlowStep,
} from "./types";

// ---------------------------------------------------------------------------
// FlowResult builder
// ---------------------------------------------------------------------------

/**
 * Build a `FlowResult` by aggregating individual step results.
 *
 * - `text` is provided by the caller (the executor's return value).
 * - `steps` are concatenated from all step results.
 * - `usage` is summed across all step results.
 * - `finishReason` is always `"stop"` for flows.
 */
export function buildFlowResult(
  text: string,
  stepResults: ReadonlyArray<AgentCallResult>,
): FlowResult {
  let promptTokens = 0;
  let completionTokens = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK step generics are complex
  const allSteps: Array<StepResult<any>> = [];

  for (const sr of stepResults) {
    promptTokens += sr.usage.promptTokens;
    completionTokens += sr.usage.completionTokens;
    for (const step of sr.steps) {
      allSteps.push(step);
    }
  }

  return {
    text,
    steps: allSteps,
    usage: { promptTokens, completionTokens },
    finishReason: "stop",
    stepResults,
  };
}

// ---------------------------------------------------------------------------
// FlowContext factory
// ---------------------------------------------------------------------------

/**
 * Create a `FlowContext` for a flow execution.
 *
 * The context tracks step results via `runStep()` and exposes them
 * as a readonly array. If step hooks are provided, `beforeStep` fires
 * before each step and `afterStep` fires after.
 */
export function createFlowContext(
  name: string,
  abort?: AbortSignal,
  hooks?: FlowHooks,
): FlowContext {
  const collected: AgentCallResult[] = [];

  return {
    name,
    abort,

    async runStep(step: FlowStep, message: string): Promise<AgentCallResult> {
      if (abort?.aborted) {
        throw new FlowExecutionError(name, "Flow was aborted");
      }

      // Step pre-hook
      await runSideEffectHooks(hooks?.beforeStep, { stepName: step.name, message });

      try {
        const result = await step.call(message);
        collected.push(result);

        // Step post-hook
        await runSideEffectHooks(hooks?.afterStep, { stepName: step.name, message, result });

        return result;
      } catch (error) {
        throw new FlowExecutionError(
          name,
          `Step "${step.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    },

    get results(): ReadonlyArray<AgentCallResult> {
      return collected;
    },
  };
}

// ---------------------------------------------------------------------------
// defineFlow — reusable flow type factory
// ---------------------------------------------------------------------------

/**
 * Define a reusable flow type.
 *
 * Returns a factory function that creates `Agent` instances with the
 * given orchestration logic. The built-in flows (`createSequentialFlow`,
 * `createCycleFlow`, `createBroadcastFlow`) are all built with `defineFlow`.
 *
 * @param typeName - Identifier for this flow type (for error messages / debugging).
 * @param executor - The orchestration function that defines step execution order.
 * @returns A factory function `(config: FlowConfig) => Agent`.
 *
 * @example
 * ```ts
 * // Define a "round-robin" flow type
 * const createRoundRobinFlow = defineFlow(
 *   "round-robin",
 *   async (steps, message, ctx) => {
 *     let current = message;
 *     for (let i = 0; i < 10; i++) {
 *       const step = steps[i % steps.length];
 *       const r = await ctx.runStep(step, current);
 *       current = r.text;
 *     }
 *     return current;
 *   },
 * );
 *
 * const flow = createRoundRobinFlow({
 *   name: "my-round-robin",
 *   steps: [agentA, agentB],
 * });
 *
 * const result = await flow.call("start");
 * ```
 */
export function defineFlow(
  typeName: string,
  executor: FlowExecutor,
): (config: FlowConfig) => Agent {
  return (config: FlowConfig): Agent => {
    return buildFlowAgent(config, typeName, executor);
  };
}

// ---------------------------------------------------------------------------
// createFlow — one-off custom flow
// ---------------------------------------------------------------------------

/**
 * Create a one-off custom flow with inline orchestration logic.
 *
 * For reusable flow types, use `defineFlow()` instead.
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
  return buildFlowAgent(config, "custom", config.execute);
}

// ---------------------------------------------------------------------------
// Internal: build the Agent from config + executor
// ---------------------------------------------------------------------------

function buildFlowAgent(config: FlowConfig, typeName: string, executor: FlowExecutor): Agent {
  if (config.steps.length === 0) {
    throw new FlowExecutionError(config.name, `${typeName} flow requires at least one step`);
  }

  // The core execute function — wrapped by withFlowHooks
  const coreExecute = async (message: string): Promise<FlowResult> => {
    const ctx = createFlowContext(config.name, config.abort, config.hooks);

    const text = await executor(config.steps, message, ctx);

    return buildFlowResult(text, ctx.results);
  };

  // Wrap with flow hooks
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
    },
  };
}
