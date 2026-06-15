// Flow utility functions.
//
// Standalone helpers for building flow results and flow contexts.

import type { Agent, AgentCallResult } from "../../agents/agent/agent.types";
import { FlowExecutionError } from "../../errors/index";
import { runSideEffectHooks } from "../../hooks";
import type { FlowContext, FlowHooks, FlowResult } from "./flow.types";

// FlowResult builder

/**
 * Build a `FlowResult` by aggregating individual step results.
 *
 * - `text` is provided by the caller (the executor's return value).
 * - `usage` is summed across all step results.
 * - `finishReason` is always `"stop"` for flows.
 */
export function buildFlowResult(
  text: string,
  stepResults: ReadonlyArray<AgentCallResult>,
): FlowResult {
  let promptTokens = 0;
  let completionTokens = 0;

  for (const stepResult of stepResults) {
    promptTokens += stepResult.usage.promptTokens;
    completionTokens += stepResult.usage.completionTokens;
  }

  return {
    text,
    usage: { promptTokens, completionTokens },
    finishReason: "stop",
    responseMessages: [],
    steps: [],
    stepResults,
  };
}

// FlowContext factory

/**
 * Create a `FlowContext` for a single flow execution.
 *
 * The context tracks step results via `runStep()` and exposes them
 * as a readonly array. If step hooks are provided, `beforeStep` fires
 * before each step and `afterStep` fires after.
 */
export function createFlowContext(
  name: string,
  hooks?: FlowHooks,
  abortSignal?: AbortSignal,
): FlowContext {
  const collected: AgentCallResult[] = [];

  return {
    name,

    async runStep(step: Agent, message: string): Promise<AgentCallResult> {
      abortSignal?.throwIfAborted();

      // Step pre-hook
      await runSideEffectHooks(hooks?.beforeStep, {
        stepName: step.name,
        message,
      });
      abortSignal?.throwIfAborted();

      try {
        const pending = step.call(message);
        const abortStep = (): void => pending.abort();
        abortSignal?.addEventListener("abort", abortStep, { once: true });

        let result: AgentCallResult;
        try {
          result = await pending;
        } finally {
          abortSignal?.removeEventListener("abort", abortStep);
        }
        abortSignal?.throwIfAborted();
        collected.push(result);

        // Step post-hook
        await runSideEffectHooks(hooks?.afterStep, {
          stepName: step.name,
          message,
          result,
        });
        abortSignal?.throwIfAborted();

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
