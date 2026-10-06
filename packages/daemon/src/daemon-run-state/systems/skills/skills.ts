import { getLogger } from "@logtape/logtape";
import { loadSkills } from "@comma-agents/core";
import type { DaemonSystem, SystemRunContext } from "../systems.types";

const logger = getLogger(["comma", "daemon", "skills"]);

export function createSkillsSystem(): DaemonSystem {
  return {
    name: "skills",
    async onRunPrepare(runContext: SystemRunContext): Promise<void> {
      const { registry, warnings } = await loadSkills(runContext.cwd);

      runContext.systemData.set("skillRegistry", registry);

      for (const warning of warnings) {
        logger.warning(
          `Failed to load skill from ${warning.sourcePath}: ${warning.message}`,
        );
      }

      logger.debug(
        `Loaded ${registry.list().length} skills for ${runContext.cwd}`,
      );
    },
  };
}
