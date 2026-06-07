import { loadSkills } from "@comma-agents/core";
import type { DaemonSystem, SystemRunContext } from "../systems.types";

export function createSkillsSystem(): DaemonSystem {
  return {
    name: "skills",

    async onRunStart(runContext: SystemRunContext): Promise<void> {
      const { registry, warnings } = await loadSkills(runContext.cwd);

      runContext.systemData.set("skillRegistry", registry);

      for (const warning of warnings) {
        runContext.logger.warn(
          `Failed to load skill from ${warning.sourcePath}: ${warning.message}`,
        );
      }

      runContext.logger.debug(
        `Loaded ${registry.list().length} skills for ${runContext.cwd}`,
      );
    },
  };
}
