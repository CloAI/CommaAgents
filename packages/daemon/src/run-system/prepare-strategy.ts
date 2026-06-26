import { dirname, resolve } from "node:path";
import type { AgentHooks, FlowHooks, LoadedStrategy } from "@comma-agents/core";
import {
  hookIntoAgent,
  isUserAgentDef,
  loadProject,
  loadStrategyFromString,
  readStrategyFile,
} from "@comma-agents/core";
import {
  CommaProjectManifestSchema,
  type HubManager,
} from "@comma-agents/core/hub";
import type { Logger } from "../logger/logger.types";
import type { SystemDataStore } from "./systems/systems.types";

export interface PrepareStrategyOptions {
  readonly strategyPath: string;
  readonly manifestPath?: string;
  readonly modelOverride?: string;
  readonly runId: string;
  readonly systemData: SystemDataStore;
  readonly logger: Logger;
  readonly flowHooks?: FlowHooks;
  readonly agentHooks?: AgentHooks;
  readonly hubManager?: HubManager;
}

/** Refuse executable code from installed packages without persisted approval. */
export async function assertProjectCodeApproved(
  manifestPath: string,
  hubManager?: HubManager,
): Promise<void> {
  if (!hubManager) return;
  const installed = await hubManager.listInstalled();
  const managed = installed.find(
    (item) =>
      resolve(item.path, "comma-project.json") === resolve(manifestPath),
  );
  if (!managed) return;
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

export async function prepareStrategy(
  options: PrepareStrategyOptions,
): Promise<LoadedStrategy> {
  const {
    strategyPath,
    manifestPath,
    modelOverride,
    runId,
    systemData,
    logger,
    flowHooks,
    agentHooks,
    hubManager,
  } = options;

  logger.debug(`Loading strategy from ${strategyPath}`);

  if (manifestPath) {
    await assertProjectCodeApproved(manifestPath, hubManager);
    await loadProject(manifestPath);
  }

  let strategyFile: Awaited<ReturnType<typeof readStrategyFile>>;
  try {
    strategyFile = await readStrategyFile(strategyPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Strategy file not found: ${strategyPath} - ${message}`);
  }

  const inputCollector = systemData.get("inputCollector");
  const launchStrategy = systemData.get("launchStrategy");
  const skillRegistry = systemData.get("skillRegistry");
  const mcpToolsByAgent = systemData.get("mcpToolsByAgent");

  const strategy = await loadStrategyFromString(
    strategyFile.content,
    strategyFile.format,
    {
      inputCollector,
      launchStrategy,
      skillRegistry,
      flowHooks,
      modelOverride,
      strategyDir: dirname(strategyPath),
      runId,
      mcpToolsByAgent,
    },
  );

  logger.info(
    `Strategy loaded: ${strategy.name} with ${Object.keys(strategy.agents).length} agents`,
  );

  if (agentHooks) {
    for (const [agentName, agent] of Object.entries(strategy.agents)) {
      if (!agent.appendHook) continue;

      const agentDefinition = strategy.raw.agents[agentName];
      if (agentDefinition && !isUserAgentDef(agentDefinition)) {
        hookIntoAgent(agent, agentHooks);
      }
    }
  }

  return strategy;
}
