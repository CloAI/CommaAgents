import type { DaemonConfig } from "../../config";
import { writeConfigModelRoles } from "../../config/config.utils";
import { createDaemonKernel } from "../../daemon-kernel";
import { setDaemonModelRoles } from "../../defaults";
import { attachExecutionLogging } from "../../plugins/runs/execution/logging";
import { createExecutionPrivacyRuntime } from "../../plugins/runs/execution/logging/privacy";

/**
 * Assemble a daemon kernel from resolved configuration, independent of any transport.
 * @param {DaemonConfig} config - Resolved daemon configuration.
 * @returns {ReturnType<typeof createDaemonKernel>} The configured kernel; the caller owns disposal.
 */
export function createConfiguredKernel(config: DaemonConfig) {
  return createDaemonKernel({
    initialize: (plugins) => {
      plugins.runs.registerRunPreparation({
        name: "privacy",
        prepare: (context) => ({
          strategyInputs: {
            privacyRuntime: createExecutionPrivacyRuntime(context),
          },
        }),
      });
      plugins.runs.registerStrategyHooks({
        name: "logging",
        attach: (context) =>
          attachExecutionLogging(context, config.logPayloads),
      });
    },
    runs: {
      runsDir: config.runsDir,
      harness: { instructionFiles: config.instructionFiles },
    },
    modelRoles: config.modelRoles,
    persistModelRoles: (modelRoles) => {
      writeConfigModelRoles(config.configFile, modelRoles);
      setDaemonModelRoles(modelRoles);
    },
  });
}
