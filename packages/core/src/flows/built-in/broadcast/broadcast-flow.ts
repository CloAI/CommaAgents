// createBroadcastFlow — fan-out flow that sends the same message to all steps.
//
// Each step receives the original message (not the output of a previous step).
// All responses are joined with a separator into the final output.
// Built on buildFlowAgent().

import type { Agent } from "../../../agents/agent/agent.types";
import { buildFlowAgent } from "../../flow/flow";
import type { BroadcastFlowConfig } from "../../flow/flow.types";
import { DEFAULT_SEPARATOR } from "./broadcast-flow.constants";

/**
 * Create a broadcast (fan-out) flow.
 *
 * The same input message is sent to every step. All responses are
 * collected and joined with a separator into the final output.
 *
 * Steps are currently called sequentially (in order). Future versions
 * may support parallel execution.
 *
 * @param config - Broadcast flow configuration.
 * @returns An `Agent` implementing the broadcast flow.
 *
 * @example
 * ```ts
 * import { createBroadcastFlow } from "@comma-agents/core";
 *
 * const flow = createBroadcastFlow({
 *   name: "multi-review",
 *   steps: [reviewer1, reviewer2, reviewer3],
 *   separator: "\n---\n",
 * });
 *
 * // All three reviewers receive the same code
 * const result = await flow.call("Review this function: ...");
 * // result.text = reviewer1's output + "\n---\n" + reviewer2's output + "\n---\n" + reviewer3's output
 * ```
 */
export function createBroadcastFlow(config: BroadcastFlowConfig): Agent {
  const separator = config.separator ?? DEFAULT_SEPARATOR;
  return buildFlowAgent(
    config,
    "broadcast",
    { ...config.hooks },
    async (steps, message, flowContext) => {
      const texts: string[] = [];
      for (const step of steps) {
        const result = await flowContext.runStep(step, message);
        texts.push(result.text);
      }
      return texts.join(separator);
    },
  );
}
