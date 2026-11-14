import { getLogger } from "@logtape/logtape";
import { discoverSkills } from "../queries";
import type { RunPreparationContext, RunPreparationResult } from "../../runs";
import type { SkillsContext } from "../state/state.types";

const logger = getLogger(["comma", "daemon", "plugins", "skills"]);

/**
 * Discover global and project skills for one root or child execution.
 * @param {SkillsContext} context - Private feature state.
 * @param {RunPreparationContext} preparation - Execution identity and working directory.
 * @returns {Promise<RunPreparationResult>} Strategy registry input and execution cleanup.
 * @internal
 */
export async function prepareRunSkills(
  context: SkillsContext,
  preparation: RunPreparationContext,
): Promise<RunPreparationResult> {
  if (context.disposed) {
    throw new Error("Skills plugin has been disposed");
  }

  if (preparation.signal.aborted) {
    throw new DOMException("Run aborted", "AbortError");
  }

  const { registry, warnings } = await discoverSkills(context, {
    cwd: preparation.cwd,
  });

  if (context.disposed) {
    throw new Error("Skills plugin has been disposed");
  }

  if (preparation.signal.aborted) {
    throw new DOMException("Run aborted", "AbortError");
  }

  for (const warning of warnings) {
    logger.warning(
      `Failed to load skill from ${warning.sourcePath}: ${warning.message}`,
    );
  }

  logger.debug(
    `Loaded ${registry.list().length} skills for ${preparation.cwd}`,
  );
  const snapshot = { registry, warnings };
  const activate = (): void => {
    if (!context.disposed && !preparation.signal.aborted) {
      context.registries.set(preparation.runId, snapshot);
    }
  };
  if (!preparation.staged) {
    activate();
  }

  return {
    ...(preparation.staged ? { activate } : {}),
    strategyInputs: { skillRegistry: registry },
    dispose: (): void => {
      if (context.registries.get(preparation.runId) === snapshot) {
        context.registries.delete(preparation.runId);
      }
    },
  };
}
