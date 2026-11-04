import { StrategyValidationError } from "../../errors/index";
import {
  MODEL_FAMILY_PATTERNS,
  MODEL_ROLE_FALLBACKS,
  MODEL_ROLE_PREFIX,
} from "./roles.constants";
import type { ModelFamily, ModelRoleSources } from "./roles.types";

/**
 * Resolve a model reference to a concrete `provider/model` identifier.
 *
 * Plain identifiers are returned unchanged. A role reference such as `@fast` is looked up
 * in the configured roles, then the strategy defaults, then along its fallback chain
 * (`compaction` → `fast` → `subagent` → `primary`; any other role → `primary`).
 *
 * @param {string} model - A model identifier or `@role` reference.
 * @param {ModelRoleSources} sources - Configured roles and strategy defaults.
 * @returns {string} The concrete model identifier.
 * @throws {StrategyValidationError} When no role along the chain has a model.
 * @example
 * ```ts
 * resolveModelReference("@fast", { defaults: { primary: "openai/gpt-5" } }); // "openai/gpt-5"
 * ```
 */
export function resolveModelReference(
  model: string,
  { configured, defaults }: ModelRoleSources,
): string {
  if (!model.startsWith(MODEL_ROLE_PREFIX)) {
    return model;
  }
  const requestedRole = model.slice(MODEL_ROLE_PREFIX.length);
  const visited: string[] = [];
  let role: string | undefined = requestedRole;
  while (role !== undefined && !visited.includes(role)) {
    visited.push(role);
    const resolved = configured?.[role] ?? defaults?.[role];
    if (resolved !== undefined) {
      return resolved;
    }
    role =
      role === "primary"
        ? undefined
        : (MODEL_ROLE_FALLBACKS[role] ?? "primary");
  }
  throw new StrategyValidationError(
    `Model role "${model}" has no model. Tried roles: ${visited.join(" → ")}. ` +
      `Set "modelRoles" in the strategy or the daemon configuration, or pass a model override.`,
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
