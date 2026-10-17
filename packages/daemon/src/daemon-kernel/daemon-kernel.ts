import { createRunsPlugin } from "../plugins/runs/runs";
import { createSandboxPlugin } from "../plugins/sandbox";
import { createQuestionsPlugin } from "../plugins/questions";
import { createSkillsPlugin } from "../plugins/skills";
import { createMcpPlugin } from "../plugins/mcp";
import { createStatusPlugin } from "../plugins/status";
import { createLspPlugin } from "../plugins/lsp";
import { createRunRepository } from "../daemon-run-state/run-repository";
import type {
  CreateDaemonKernelOptions,
  DaemonKernel,
} from "./daemon-kernel.types";

/**
 * Construct daemon-owned plugins and initialize feature registrations.
 *
 * @param {CreateDaemonKernelOptions} options - Runs configuration and startup initializer.
 * @returns {Promise<DaemonKernel>} The initialized daemon kernel.
 * @example
 * ```ts
 * const daemon = await createDaemonKernel({ runs: { runsDir } });
 * const prepared = await daemon.plugins.runs.prepareRun({ strategyPath });
 * ```
 */
export async function createDaemonKernel({
  runs,
  initialize,
}: CreateDaemonKernelOptions): Promise<DaemonKernel> {
  const status = createStatusPlugin();
  const runsPlugin = createRunsPlugin(runs);
  const sandboxPlugin = createSandboxPlugin({
    dependencies: { runs: runsPlugin },
  });
  const questionsPlugin = createQuestionsPlugin({
    dependencies: { runs: runsPlugin },
  });
  const skillsPlugin = createSkillsPlugin({
    dependencies: { runs: runsPlugin },
  });
  const mcpPlugin = createMcpPlugin({
    dependencies: {
      runs: runsPlugin,
      runRepository: createRunRepository({ runsDir: runs.runsDir }),
    },
  });
  const lspPlugin = createLspPlugin({ dependencies: { runs: runsPlugin } });
  const plugins = {
    status: status.plugin,
    runs: runsPlugin,
    sandbox: sandboxPlugin,
    questions: questionsPlugin,
    skills: skillsPlugin,
    mcp: mcpPlugin,
    lsp: lspPlugin,
  };
  let disposal: Promise<void> | undefined;
  async function disposePlugins(): Promise<void> {
    status.setPhase("stopping");
    const failures: unknown[] = [];
    for (const plugin of [
      runsPlugin,
      lspPlugin,
      mcpPlugin,
      skillsPlugin,
      questionsPlugin,
      sandboxPlugin,
    ]) {
      try {
        await plugin.dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    status.setPhase("stopped");
    await status.plugin.dispose();
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, "Daemon plugin cleanup failed");
    }
  }
  function dispose(): Promise<void> {
    disposal ??= disposePlugins();
    return disposal;
  }
  try {
    await initialize?.(plugins);
    status.setPhase("running");
    return {
      plugins,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
