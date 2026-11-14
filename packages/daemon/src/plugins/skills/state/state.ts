import { SkillSummarySchema } from "@comma-agents/core/skills";
import type { LoadSkillsOptions, Skill } from "@comma-agents/core/skills";
import type { SkillsContext } from "./state.types";

/**
 * Allocate the skills plugin's private state.
 * @param {LoadSkillsOptions} discovery - Core-owned discovery options.
 * @returns {SkillsContext} Execution registries and disposal state.
 * @internal
 */
export function createSkillsContext(
  discovery: LoadSkillsOptions = {},
): SkillsContext {
  return { registries: new Map(), discovery, disposed: false };
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
  return context.registries.get(runId)?.registry.list() ?? [];
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

/** Read metadata and diagnostics from the preparation snapshot without scanning.
 * @param {SkillsContext} context - Owning feature state.
 * @param {string} runId - Requested execution identity.
 * @returns {RunSkillsResult} Availability and the captured metadata/diagnostics.
 * @internal
 */
export function listSkillsForRun(context: SkillsContext, runId: string) {
  const snapshot = context.registries.get(runId);
  return {
    available: snapshot !== undefined,
    skills:
      snapshot?.registry
        .list()
        .map((skill) => SkillSummarySchema.parse(skill)) ?? [],
    warnings: snapshot?.warnings ?? [],
  };
}
