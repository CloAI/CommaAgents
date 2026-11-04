import type { AgentCallResult, LoadedStrategy } from "@comma-agents/core";
import type { RunResultSummary } from "../runs.types";
import { RunResultSummarySchema } from "../state/state.schemas";

/**
 * Find the interactive first leaf without traversing broadcast branches.
 * @param {LoadedStrategy} strategy - Strategy whose execution is about to start.
 * @returns {string | undefined} Eligible user-agent name, if execution starts with one.
 * @internal
 */
export function initialInputAgent(
  strategy: LoadedStrategy,
): string | undefined {
  let firstStep = strategy.raw.flow;
  while (firstStep.type !== "broadcast") {
    const nextStep = firstStep.steps[0];
    if (nextStep === undefined) {
      return undefined;
    }
    if ("agent" in nextStep) {
      const agentDefinition = strategy.raw.agents[nextStep.agent];
      return agentDefinition?.type === "user" &&
        agentDefinition.config?.requireInput !== false
        ? nextStep.agent
        : undefined;
    }
    firstStep = nextStep;
  }
  return undefined;
}
/**
 * Produce a durable result summary with JSON-safe strategy data.
 * @param {AgentCallResult} result - Completed strategy result.
 * @returns {RunResultSummary} Persistable summary of the final result.
 * @internal
 */
export function resultSummary(result: AgentCallResult): RunResultSummary {
  const data = "data" in result ? result.data : undefined;
  let serializedData: unknown;
  if (data !== undefined) {
    const json = JSON.stringify(data);
    if (json === undefined) {
      throw new Error("Strategy result data must be JSON-safe");
    }
    serializedData = JSON.parse(json) as unknown;
  }
  return RunResultSummarySchema.parse({
    version: 1,
    text: result.text,
    finishReason: result.finishReason,
    usage: result.usage,
    ...(data !== undefined ? { data: serializedData } : {}),
  });
}
