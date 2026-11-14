import { join } from "node:path";
import { createProjectsPlugin } from "../plugins/projects";
import { createCorePlugin } from "../plugins/core";
import { createRunsPlugin } from "../plugins/runs/runs";
import { createSandboxPlugin } from "../plugins/sandbox";
import { createQuestionsPlugin } from "../plugins/questions";
import { createSkillsPlugin } from "../plugins/skills";
import { createMcpPlugin } from "../plugins/mcp";
import { createStatusPlugin } from "../plugins/status";
import { createLspPlugin } from "../plugins/lsp";
import type { CreateDaemonKernelOptions } from "./daemon-kernel.types";

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
  skills,
  modelRoles,
  persistModelRoles,
  initialize,
}: CreateDaemonKernelOptions) {
  const status = createStatusPlugin();
  const corePlugin = createCorePlugin({ modelRoles, persistModelRoles });
  const runsPlugin = createRunsPlugin({
    ...runs,
    harness: { ...runs.harness, getModelRoles: corePlugin.getModelRoles },
  });
  const sandboxPlugin = createSandboxPlugin({
    dependencies: { runs: runsPlugin },
  });
  const questionsPlugin = createQuestionsPlugin({
    dependencies: { runs: runsPlugin },
  });
  const skillsPlugin = createSkillsPlugin({
    discovery: skills,
    dependencies: { runs: runsPlugin },
  });
  const mcpPlugin = createMcpPlugin({
    dependencies: {
      runs: runsPlugin,
    },
  });
  const lspPlugin = createLspPlugin({ dependencies: { runs: runsPlugin } });
  const projectsPlugin = await createProjectsPlugin({
    catalogFile: join(runs.runsDir, ".projects", "catalog.json"),
    dependencies: { runs: runsPlugin, questions: questionsPlugin, sandbox: sandboxPlugin },
  }).catch(async (error: unknown) => {
    status.setPhase("stopping");
    const failures: unknown[] = [error];
    for (const plugin of [runsPlugin, lspPlugin, mcpPlugin, skillsPlugin, questionsPlugin, sandboxPlugin, corePlugin]) {
      try {
        await plugin.dispose();
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
    }
    status.setPhase("stopped");
    await status.plugin.dispose();
    if (failures.length > 1) {
      throw new AggregateError(failures, "Project initialization and plugin cleanup failed");
    }
    throw error;
  });
  const plugins = {
    core: corePlugin,
    status: status.plugin,
    runs: runsPlugin,
    projects: projectsPlugin,
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
      projectsPlugin,
      runsPlugin,
      lspPlugin,
      mcpPlugin,
      skillsPlugin,
      questionsPlugin,
      sandboxPlugin,
      corePlugin,
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
