import { createPlugin } from "../../daemon-plugin";
import {
  createSkillsContext,
  listRunSkills,
  listSkillsForRun,
  disposeSkills,
} from "./state";
import {
  listWorkspaceSkills,
  getWorkspaceSkill,
  searchWorkspaceSkills,
} from "./queries";
import {
  listSkillsCommand,
  getSkillsCommand,
  searchSkillsCommand,
  listForRunSkillsCommand,
} from "./server";
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
  discovery,
}: CreateSkillsPluginOptions) {
  const context = createSkillsContext(discovery);
  const plugin = createPlugin({
    name: "skills",
    server: {
      commands: [
        listSkillsCommand,
        getSkillsCommand,
        searchSkillsCommand,
        listForRunSkillsCommand,
      ],
    },
    cleanup: async () => disposeSkills(context),
  });

  dependencies.runs.registerRunPreparation({
    name: "skills",
    prepare: (preparation) => prepareRunSkills(context, preparation),
  });

  const methods: Omit<SkillsPlugin, keyof typeof plugin> = {
    list: (options = {}) => listWorkspaceSkills(context, options),
    get: (options) => getWorkspaceSkill(context, options),
    search: (options) => searchWorkspaceSkills(context, options),
    listForRun: ({ runId }) => listSkillsForRun(context, runId),
    listSkills: (runId) => listRunSkills(context, runId),
  };
  return Object.assign(plugin, methods);
}
