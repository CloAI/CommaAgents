import { dirname, resolve } from "node:path";
import { CommaProjectManifestSchema } from "@comma-agents/core/hub";
import type { LoadedStrategy } from "@comma-agents/core";
import type { LoadRunStrategyOptions } from "./loading.types";
/**
 * Load a strategy after its run-scoped services are available.
 *
 * @param {LoadRunStrategyOptions} options - Strategy and runtime inputs.
 * @returns {Promise<LoadedStrategy>} The executable strategy.
 */
export async function loadRunStrategy({
  strategyPath,
  manifestPath,
  modelRoles,
  runId,
  inputCollector,
  launchStrategy,
  requestStrategySwitch,
  strategyInputs,
  hubManager,
  cwd,
  harness,
}: LoadRunStrategyOptions): Promise<LoadedStrategy> {
  // Load only the strategy module; runs has no dependency on the core barrel.
  const { loadProject, loadStrategyFromString, readStrategyFile } =
    await import("@comma-agents/core/strategy");
  if (manifestPath !== undefined) {
    if (hubManager !== undefined) {
      const installed = await hubManager.listInstalled();
      const managed = installed.find(
        (item) =>
          resolve(item.path, "comma-project.json") === resolve(manifestPath),
      );
      if (managed !== undefined) {
        const manifest = CommaProjectManifestSchema.parse(
          JSON.parse(await Bun.file(manifestPath).text()),
        );
        if (
          manifest.permissions?.executesCode &&
          !(await hubManager.isExecutableCodeApproved(manifestPath))
        ) {
          throw new Error(
            `Executable code is not approved for installed Hub package ${manifest.name}`,
          );
        }
      }
    }
    await loadProject(manifestPath);
  }

  const strategyFile = await readStrategyFile(strategyPath);
  return loadStrategyFromString(strategyFile.content, strategyFile.format, {
    ...strategyInputs,
    inputCollector,
    launchStrategy,
    requestStrategySwitch,
    strategyDir: dirname(strategyPath),
    runId,
    cwd,
    modelRoles: { ...harness?.getModelRoles?.(), ...modelRoles },
    instructionFiles: harness?.instructionFiles,
  });
}
