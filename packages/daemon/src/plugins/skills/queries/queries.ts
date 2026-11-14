import { getLogger } from "@logtape/logtape";
import {
  loadSkills,
  searchSkills,
  SkillSummarySchema,
} from "@comma-agents/core/skills";
import type { SkillsContext } from "../state/state.types";
import type { SkillsWorkspaceOptions } from "../skills.types";

const logger = getLogger(["comma", "daemon", "plugins", "skills"]);

/** Scan current workspace files using the same discovery settings as prepared runs.
 * @param {SkillsContext} context - Owning plugin lifetime and discovery roots.
 * @param {SkillsWorkspaceOptions} options - Workspace to inspect.
 * @returns {Promise<SkillLoadResult>} Fresh registry and diagnostics.
 * @internal
 */
export async function discoverSkills(
  context: SkillsContext,
  { cwd = process.cwd() }: SkillsWorkspaceOptions,
) {
  if (context.disposed) {
    throw new Error("Skills plugin has been disposed");
  }
  const result = await loadSkills(cwd, context.discovery);
  if (context.disposed) {
    throw new Error("Skills plugin has been disposed");
  }
  if (context.discovery.projectSkillsDir === undefined && !result.projectRoot) {
    logger.warning(
      `No .comma project root found for ${cwd}; project skills discovery was skipped.`,
    );
  }
  return result;
}

/** Browse current resolved metadata and diagnostics without exposing skill contents.
 * @param {SkillsContext} context - Owning feature state.
 * @param {SkillsWorkspaceOptions} options - Working directory.
 * @returns {Promise<SkillsListResult>} Resolved summaries and warnings.
 * @internal
 */
export async function listWorkspaceSkills(
  context: SkillsContext,
  options: SkillsWorkspaceOptions = {},
) {
  const { registry, warnings } = await discoverSkills(context, options);
  return {
    skills: registry.list().map((skill) => SkillSummarySchema.parse(skill)),
    warnings,
  };
}

/** Read one exact skill from a fresh workspace discovery.
 * @param {SkillsContext} context - Owning feature state.
 * @param {SkillsWorkspaceOptions & {name: string}} options - Workspace and exact skill identity.
 * @returns {Promise<object>} Skill content and discovery diagnostics.
 * @internal
 */
export async function getWorkspaceSkill(
  context: SkillsContext,
  { name, ...options }: SkillsWorkspaceOptions & { readonly name: string },
) {
  const { registry, warnings } = await discoverSkills(context, options);
  const skill = registry.get(name);
  if (!skill) {
    throw Object.assign(new Error(`Skill was not found: ${name}`), {
      code: "NOT_FOUND",
    });
  }
  return { skill, warnings };
}

/** Search metadata in a fresh workspace discovery using core's shared ranking.
 * @param {SkillsContext} context - Owning feature state.
 * @param {SkillsWorkspaceOptions & {query: string, limit?: number}} options - Query and result limit.
 * @returns {Promise<object>} Ranked matches, total count, and diagnostics.
 * @internal
 */
export async function searchWorkspaceSkills(
  context: SkillsContext,
  {
    query,
    limit,
    ...options
  }: SkillsWorkspaceOptions & {
    readonly query: string;
    readonly limit?: number;
  },
) {
  const { registry, warnings } = await discoverSkills(context, options);
  return { ...searchSkills(registry, { query, limit }), warnings };
}
