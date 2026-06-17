// applyOverrides — produce a new Strategy with layered prompt edits applied.
//
// The base strategy is deep-cloned so the caller's object (and the file it
// came from) is never mutated. Each override targets one LLM agent and may
// replace, append to, or templatize that agent's system prompt.

import {
  isLLMAgentDef,
  type LLMAgentDef,
  type Strategy,
} from "@comma-agents/core";
import type { PromptOverride } from "./overrides.types";

/** Block separator inserted between an existing prompt and appended text. */
const APPEND_SEPARATOR = "\n\n";

/**
 * Apply a list of {@link PromptOverride}s to a strategy, returning a new
 * strategy object. The input `base` is never mutated.
 *
 * @param base - The raw, validated strategy (e.g. `LoadedStrategy.raw`).
 * @param overrides - Layered prompt edits, applied in array order.
 * @returns A deep-cloned strategy with the overrides applied.
 * @throws If an override targets an unknown agent or a non-LLM (user) agent.
 */
export function applyOverrides(
  base: Strategy,
  overrides: readonly PromptOverride[],
): Strategy {
  const next = structuredClone(base) as Strategy;

  for (const override of overrides) {
    const agent = next.agents[override.agentName];
    if (!agent) {
      throw new Error(
        `Prompt override targets unknown agent "${override.agentName}". ` +
          `Available agents: ${Object.keys(next.agents).join(", ")}`,
      );
    }
    if (!isLLMAgentDef(agent)) {
      throw new Error(
        `Prompt override targets "${override.agentName}", which is a user agent. ` +
          `Only LLM agents have prompts to override.`,
      );
    }

    applyToAgent(agent, override);
  }

  return next;
}

/** Mutate a single (already-cloned) LLM agent definition in place. */
function applyToAgent(agent: LLMAgentDef, override: PromptOverride): void {
  if (override.systemPrompt !== undefined) {
    agent.systemPrompt = override.systemPrompt;
  }

  if (override.appendToSystemPrompt !== undefined) {
    const existing = agent.systemPrompt ?? "";
    agent.systemPrompt =
      existing.length > 0
        ? `${existing}${APPEND_SEPARATOR}${override.appendToSystemPrompt}`
        : override.appendToSystemPrompt;
  }

  if (override.templateVariables !== undefined) {
    if (!agent.systemPromptTemplate) {
      throw new Error(
        `Prompt override sets templateVariables for agent "${override.agentName}" ` +
          `but that agent has no systemPromptTemplate to merge into.`,
      );
    }
    agent.systemPromptTemplate.variables = {
      ...agent.systemPromptTemplate.variables,
      ...(override.templateVariables as Record<
        string,
        string | number | boolean | string[] | Record<string, string>
      >),
    };
  }
}
