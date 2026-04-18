// createSequentialFlow — pipeline flow that chains agents in sequence.
//
// Each agent receives the previous agent's output as its input.
// Built on buildFlowAgent().

import type { Agent } from "../../../agents/agent/agent.types";
import { buildFlowAgent } from "../../flow/flow";
import type { FlowConfig } from "../../flow/flow.types";

// createSequentialFlow

/**
 * Create a sequential (pipeline) flow.
 *
 * Agents are called one after another. The output of each agent becomes
 * the input of the next. The final agent's output is the flow's result.
 *
 * @param config - Flow configuration with steps to run in sequence.
 * @returns An `Agent` implementing the sequential pipeline.
 *
 * @example
 * ```ts
 * import { createSequentialFlow, createAgent } from "@comma-agents/core";
 *
 * const flow = createSequentialFlow({
 *   name: "code-review",
 *   steps: [writer, reviewer, editor],
 * });
 *
 * // writer("Write a function") → reviewer(writer's output) → editor(reviewer's output)
 * const result = await flow.call("Write a function that adds two numbers");
 * ```
 */
export function createSequentialFlow(config: FlowConfig): Agent {
  return buildFlowAgent(config, "sequential", {}, async (steps, message, flowContext) => {
    let current = message;
    for (const step of steps) {
      const result = await flowContext.runStep(step, current);
      current = result.text;
    }
    return current;
  });
}
