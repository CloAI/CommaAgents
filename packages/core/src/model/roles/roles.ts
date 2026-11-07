import { MissingModelRolesError } from "../../errors/index";
import type { AgentDef, LLMAgentDef, Strategy } from "../../strategy/schema";
import { MODEL_FAMILY_PATTERNS, MODEL_ROLE_PREFIX } from "./roles.constants";
import type { ModelFamily, ModelRoleSources } from "./roles.types";

/**
 * Resolve a model reference to a concrete `provider/model` identifier.
 *
 * Plain identifiers are returned unchanged. A role reference such as `@medium` is looked up
 * in the configured roles, then the strategy defaults; there is no fallback to another role.
 *
 * @param {string} model - A model identifier or `@role` reference.
 * @param {ModelRoleSources} sources - Configured roles and strategy defaults.
 * @returns {string} The concrete model identifier.
 * @throws {MissingModelRolesError} When the role has no model.
 * @example
 * ```ts
 * resolveModelReference("@medium", { configured: { medium: "openai/gpt-5" } }); // "openai/gpt-5"
 * ```
 */
export function resolveModelReference(
  model: string,
  { configured, defaults }: ModelRoleSources,
): string {
  if (!model.startsWith(MODEL_ROLE_PREFIX)) {
    return model;
  }
  const role = model.slice(MODEL_ROLE_PREFIX.length);
  const resolved = configured?.[role] ?? defaults?.[role];
  if (resolved === undefined) {
    throw new MissingModelRolesError([role]);
  }
  return resolved;
}

/** Narrow an agent definition to the LLM kind, which `type` may omit. */
export function isLlmAgent(agent: AgentDef): agent is LLMAgentDef {
  return agent.type === undefined || agent.type === "llm";
}

/**
 * List the roles an agent's model or compaction model refers to in one strategy.
 *
 * @param {Strategy} strategy - A parsed strategy.
 * @returns {string[]} Unique role names without the `@` prefix, in first-use order.
 */
export function collectModelRoleReferences(strategy: Strategy): string[] {
  const references = new Set<string>();
  for (const agent of Object.values(strategy.agents)) {
    if (!isLlmAgent(agent)) {
      continue;
    }
    const compaction = agent.context?.compaction;
    for (const model of [
      agent.model,
      typeof compaction === "object" ? compaction.model : undefined,
    ]) {
      if (model?.startsWith(MODEL_ROLE_PREFIX)) {
        references.add(model.slice(MODEL_ROLE_PREFIX.length));
      }
    }
  }
  return [...references];
}

/**
 * Find the roles a strategy refers to that no source defines.
 *
 * @param {Strategy} strategy - A parsed strategy.
 * @param {ModelRoleSources} sources - Configured roles; the strategy's own `modelRoles` are added as defaults.
 * @returns {string[]} Missing role names without the `@` prefix.
 */
export function findMissingModelRoles(
  strategy: Strategy,
  { configured }: ModelRoleSources,
): string[] {
  return collectModelRoleReferences(strategy).filter(
    (role) =>
      configured?.[role] === undefined &&
      strategy.modelRoles?.[role] === undefined,
  );
}

/**
 * Classify a concrete model identifier into a coarse family for prompt adjustments.
 *
 * @param {string} model - A `provider/model` identifier.
 * @returns {ModelFamily} `claude`, `gpt`, `gemini`, or `other`.
 * @example
 * ```ts
 * getModelFamily("openrouter/google/gemini-3.5-flash"); // "gemini"
 * ```
 */
export function getModelFamily(model: string): ModelFamily {
  const modelId = model.toLowerCase();
  return (
    MODEL_FAMILY_PATTERNS.find(([, pattern]) => pattern.test(modelId))?.[0] ??
    "other"
  );
}
