import type { SelectOption } from "../../design-system/Select";
import type { DiscoveredModel, DiscoveredProvider } from "../ModelBrowser";
import { splitModel } from "../../hooks/useStrategyModels";
import type { StepRow } from "../../hooks/useStrategyModels";

/** Why a step's current model may not run; informational, never blocking. */
export type ModelIssue =
  | "No model set"
  | "Provider not connected"
  | "Model not in catalog";

/**
 * Check whether a provider can be used without more setup.
 * @param {DiscoveredProvider} provider - Discovered provider.
 * @returns {boolean} Whether credentials are available or none are needed.
 */
export function isConnected(provider: DiscoveredProvider): boolean {
  return (
    provider.authStatus === "configured" || provider.credentialType === "none"
  );
}

/**
 * Describe the problem, if any, with the model a step would use.
 * @param {StepRow} row - Step with its effective model.
 * @param {readonly DiscoveredProvider[]} providers - Discovered providers.
 * @returns {ModelIssue | undefined} The first problem found, or undefined when none.
 */
export function modelIssue(
  row: StepRow,
  providers: readonly DiscoveredProvider[],
): ModelIssue | undefined {
  if (row.kind !== "llm") return undefined;
  if (row.effectiveModel === undefined) return "No model set";
  const parts = splitModel(row.effectiveModel);
  const provider = providers.find(
    (candidate) => candidate.id === parts?.providerId,
  );
  if (!parts || !provider) return "Model not in catalog";
  if (!isConnected(provider)) return "Provider not connected";
  return provider.models.some((model) => model.id === parts.modelId)
    ? undefined
    : "Model not in catalog";
}

/**
 * Explain why a model would weaken an agent's required protections.
 * @param {StepRow["privacy"]} privacy - Protections the agent requires.
 * @param {DiscoveredModel} model - Candidate model.
 * @returns {string | undefined} The unmet requirement, or undefined when satisfied.
 */
export function privacyIssue(
  privacy: StepRow["privacy"],
  model: DiscoveredModel,
): string | undefined {
  if (
    privacy?.e2ee === "required" &&
    model.metadata.capabilities?.e2ee !== true
  )
    return "Requires E2EE support";
  if (
    privacy?.tee === "required" &&
    model.metadata.capabilities?.teeAttestation !== true
  )
    return "Requires TEE attestation";
  return undefined;
}

/**
 * Choose which LLM agents a model can be applied to.
 * @param {readonly StepRow[]} steps - Steps in flow order.
 * @param {DiscoveredModel} model - Candidate model.
 * @returns {{eligible: string[], skipped: string[]}} Distinct agent names by privacy outcome.
 */
export function partitionAgents(
  steps: readonly StepRow[],
  model: DiscoveredModel,
): { readonly eligible: string[]; readonly skipped: string[] } {
  const seen = new Set<string>();
  const eligible: string[] = [];
  const skipped: string[] = [];
  for (const step of steps) {
    if (step.kind !== "llm" || seen.has(step.agent)) continue;
    seen.add(step.agent);
    (privacyIssue(step.privacy, model) === undefined ? eligible : skipped).push(
      step.agent,
    );
  }
  return { eligible, skipped };
}

/**
 * List the models of connected providers as dropdown options grouped by provider.
 * @param {readonly DiscoveredProvider[]} providers - Discovered providers.
 * @param {StepRow["privacy"]} privacy - Protections every affected agent requires.
 * @returns {{options: SelectOption[], groups: string[]}} Options, with unmet privacy requirements as disabled reasons, and provider names in order.
 */
export function modelOptions(
  providers: readonly DiscoveredProvider[],
  privacy: StepRow["privacy"],
): { readonly options: SelectOption[]; readonly groups: string[] } {
  const connected = providers.filter(isConnected);
  return {
    groups: connected.map((provider) => provider.name),
    options: connected.flatMap((provider) =>
      provider.models.map((model) => {
        const reason = privacyIssue(privacy, model);
        return {
          value: `${provider.id}/${model.id}`,
          label: model.metadata.name ?? model.id,
          description: `${provider.id}/${model.id}`,
          group: provider.name,
          ...(reason === undefined ? {} : { disabled: reason }),
        };
      }),
    ),
  };
}
