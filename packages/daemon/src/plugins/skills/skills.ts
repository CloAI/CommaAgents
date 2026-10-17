import { createPlugin } from "../../daemon-plugin";
import { createSkillsContext, listRunSkills, disposeSkills } from "./state";
import { prepareRunSkills } from "./preparation";
import type { CreateSkillsPluginOptions, SkillsPlugin } from "./skills.types";

/**
 * Register skill discovery for each root and child strategy preparation.
 * @param {CreateSkillsPluginOptions} options - Runs plugin dependency.
 * @returns {SkillsPlugin} Loaded skill listings and resource cleanup.
 * @example
 * ```ts
 * const skills = createSkillsPlugin({ dependencies: { runs } });
 * const prepared = await runs.prepareRun({ strategyPath });
 * console.log(skills.listSkills(prepared.runId));
 * ```
 */
export function createSkillsPlugin({
  dependencies,
}: CreateSkillsPluginOptions): SkillsPlugin {
  const context = createSkillsContext();
  const plugin = createPlugin({
    name: "skills",
    cleanup: async () => disposeSkills(context),
  });

  dependencies.runs.registerRunPreparation({
    name: "skills",
    prepare: (preparation) => prepareRunSkills(context, preparation),
  });

  return { ...plugin, listSkills: (runId) => listRunSkills(context, runId) };
}
