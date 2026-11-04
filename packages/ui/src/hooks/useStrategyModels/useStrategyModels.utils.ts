import type {
  DescribedStrategy,
  StepRow,
  UniformModel,
} from "./useStrategyModels.types";

/**
 * Split a `providerID/modelID` string at its first slash.
 * @param {string} model - Model string; the model ID may itself contain slashes.
 * @returns {{providerId: string, modelId: string} | undefined} Parts, or undefined without a slash.
 */
export function splitModel(
  model: string,
): { readonly providerId: string; readonly modelId: string } | undefined {
  const slash = model.indexOf("/");
  return slash <= 0 || slash === model.length - 1
    ? undefined
    : { providerId: model.slice(0, slash), modelId: model.slice(slash + 1) };
}

/**
 * Join each step with its agent and the model that will actually be used.
 * @param {DescribedStrategy} strategy - Described agents and steps.
 * @param {Readonly<Record<string, string>>} overrides - Chosen models by agent name.
 * @returns {StepRow[]} Rows in flow order.
 */
export function buildStepRows(
  strategy: DescribedStrategy,
  overrides: Readonly<Record<string, string>>,
): StepRow[] {
  const agents = new Map(strategy.agents.map((agent) => [agent.name, agent]));
  const uses = new Map<string, number>();
  for (const step of strategy.steps) {
    uses.set(step.agent, (uses.get(step.agent) ?? 0) + 1);
  }
  return strategy.steps.map((step, index) => {
    const agent = agents.get(step.agent);
    const kind = agent?.kind ?? "custom";
    const override = kind === "llm" ? overrides[step.agent] : undefined;
    const defaultModel = agent?.model;
    const effectiveModel = override ?? defaultModel;
    return {
      key: `${index}:${step.agent}`,
      flow: step.flow,
      depth: step.depth,
      role: step.role,
      ...(step.description === undefined
        ? {}
        : { description: step.description }),
      agent: step.agent,
      kind,
      ...(agent?.description === undefined
        ? {}
        : { agentDescription: agent.description }),
      ...(defaultModel === undefined ? {} : { defaultModel }),
      ...(agent?.modelRole === undefined ? {} : { modelRole: agent.modelRole }),
      ...(override === undefined ? {} : { override }),
      ...(effectiveModel === undefined ? {} : { effectiveModel }),
      ...(agent?.privacy === undefined ? {} : { privacy: agent.privacy }),
      sharedBy: uses.get(step.agent) ?? 1,
    };
  });
}

/**
 * Find the single model that all LLM agents share, when replacing it needs no per-step context.
 * @param {readonly StepRow[]} steps - Steps with their effective models.
 * @returns {UniformModel | undefined} The shared model, or undefined when agents differ in model or privacy.
 */
export function findUniform(
  steps: readonly StepRow[],
): UniformModel | undefined {
  const agents = new Map<string, StepRow>();
  for (const step of steps) {
    if (step.kind === "llm" && !agents.has(step.agent))
      agents.set(step.agent, step);
  }
  const [first, ...rest] = [...agents.values()];
  if (!first) {
    return undefined;
  }
  const same = rest.every(
    (agent) =>
      agent.effectiveModel === first.effectiveModel &&
      agent.privacy?.tee === first.privacy?.tee &&
      agent.privacy?.e2ee === first.privacy?.e2ee,
  );
  return same
    ? {
        model: first.effectiveModel,
        privacy: first.privacy,
        agents: [...agents.keys()],
        overridden: [...agents.values()].some(
          (agent) => agent.override !== undefined,
        ),
      }
    : undefined;
}
