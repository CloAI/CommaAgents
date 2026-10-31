import {
  isAgentStep,
  isFlowDef,
  isLLMAgentDef,
  isUserAgentDef,
} from "@comma-agents/core/strategy";
import { resolveModelReference } from "@comma-agents/core/strategy";
import type { FlowDef, Strategy } from "@comma-agents/core/strategy";
import type { z } from "zod/v4";
import type { DescribeStrategyOutputSchema } from "./describe-strategy.schemas";

type Described = z.output<typeof DescribeStrategyOutputSchema>;

/**
 * Summarize a parsed strategy's agents and the order they are used.
 * @param {Strategy} strategy - Validated strategy definition.
 * @param {Readonly<Record<string, string>>} [modelRoles] - User-configured models for `@role` references.
 * @returns {Described} Agent registry entries and flattened steps.
 */
export function describeStrategy(
  strategy: Strategy,
  modelRoles: Readonly<Record<string, string>> = {},
): Described {
  const steps: Described["steps"][number][] = [];
  collectSteps(strategy.flow, 0, steps);
  return {
    name: strategy.name,
    version: strategy.version,
    ...(strategy.description === undefined
      ? {}
      : { description: strategy.description }),
    agents: Object.entries(strategy.agents).map(([name, definition]) => {
      const description =
        definition.description === undefined
          ? {}
          : { description: definition.description };
      if (isUserAgentDef(definition))
        return { name, kind: "user" as const, ...description };
      if (!isLLMAgentDef(definition))
        return { name, kind: "custom" as const, ...description };
      return {
        name,
        kind: "llm" as const,
        ...description,
        ...describeModel(definition.model, modelRoles, strategy.modelRoles),
        ...(definition.privacy === undefined
          ? {}
          : { privacy: definition.privacy }),
      };
    }),
    steps,
  };
}

/**
 * Append a flow's agent steps depth-first; a cycle's observer follows its steps.
 * @param {FlowDef} flow - Flow to walk.
 * @param {number} depth - Nesting level of this flow.
 * @param {Described["steps"][number][]} steps - Output list in flow order.
 * @returns {void} Nothing; `steps` is appended to.
 */
function collectSteps(
  flow: FlowDef,
  depth: number,
  steps: Described["steps"][number][],
): void {
  const entry = { flow: flow.name, flowType: flow.type, depth };
  for (const step of flow.steps) {
    if (isAgentStep(step))
      steps.push({
        ...entry,
        agent: step.agent,
        role: "step",
        ...(step.description === undefined
          ? {}
          : { description: step.description }),
      });
    else if (isFlowDef(step)) collectSteps(step, depth + 1, steps);
  }
  if ("observer" in flow && typeof flow.observer === "string")
    steps.push({ ...entry, agent: flow.observer, role: "observer" });
}

/**
 * Resolve an agent's model reference for display, naming the role when it is one.
 * @param {string | undefined} model - Declared model or `@role` reference.
 * @param {Readonly<Record<string, string>>} configured - User-configured roles.
 * @param {Readonly<Record<string, string>> | undefined} defaults - The strategy's role defaults.
 * @returns {{ model?: string; modelRole?: string }} Concrete model when resolvable, and the role name.
 */
function describeModel(
  model: string | undefined,
  configured: Readonly<Record<string, string>>,
  defaults: Readonly<Record<string, string>> | undefined,
): { readonly model?: string; readonly modelRole?: string } {
  if (model === undefined) return {};
  if (!model.startsWith("@")) return { model };
  const modelRole = model.slice(1);
  try {
    return {
      model: resolveModelReference(model, { configured, defaults }),
      modelRole,
    };
  } catch {
    // An unconfigured role is shown by name so the user can pick a model for it.
    return { modelRole };
  }
}
