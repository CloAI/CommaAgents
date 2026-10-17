import type { Skill } from "@comma-agents/core/skills";
import type { SkillsContext } from "./state.types";

/**
 * Allocate the skills plugin's private state.
 * @returns {SkillsContext} Execution registries and disposal state.
 * @internal
 */
export function createSkillsContext(): SkillsContext {
  return { registries: new Map(), disposed: false };
}

/**
 * Read the skills available to one execution without exposing its mutable registry.
 * @param {SkillsContext} context - Private feature state.
 * @param {string} runId - Execution whose skills are requested.
 * @returns {readonly Skill[]} Sorted loaded skills, or an empty list when unavailable.
 * @internal
 */
export function listRunSkills(
  context: SkillsContext,
  runId: string,
): readonly Skill[] {
  return context.registries.get(runId)?.list() ?? [];
}

/**
 * Release all retained registries and prevent further preparation.
 * @param {SkillsContext} context - Private feature state.
 * @returns {void} Nothing; clears feature resources.
 * @internal
 */
export function disposeSkills(context: SkillsContext): void {
  context.disposed = true;
  context.registries.clear();
}
