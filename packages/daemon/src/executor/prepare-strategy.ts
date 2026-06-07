import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AgentHooks,
  ConversationTurn,
  FlowHooks,
  LoadedStrategy,
} from "@comma-agents/core";
import {
  hookIntoAgent,
  isUserAgentDef,
  loadStrategyFromString,
} from "@comma-agents/core";
import type { Logger } from "../logger/logger.types";
import type { SystemDataStore } from "./systems/systems.types";

export interface PrepareStrategyOptions {
  readonly strategyPath: string;
  readonly modelOverride?: string;
  readonly runId: string;
  readonly systemData: SystemDataStore;
  readonly logger: Logger;
  readonly flowHooks?: FlowHooks;
  readonly agentHooks?: AgentHooks;
  readonly previousTurns?: ReadonlyMap<string, readonly ConversationTurn[]>;
}

export async function prepareStrategy(
  options: PrepareStrategyOptions,
): Promise<LoadedStrategy> {
  const {
    strategyPath,
    modelOverride,
    runId,
    systemData,
    logger,
    flowHooks,
    agentHooks,
    previousTurns,
  } = options;

  logger.debug(`Loading strategy from ${strategyPath}`);

  let content: string;
  try {
    content = readFileSync(strategyPath, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Strategy file not found: ${strategyPath} - ${message}`);
  }
  const format = strategyPath.endsWith(".json") ? "json" : "yaml";

  const inputCollector = systemData.get("inputCollector");
  const launchStrategy = systemData.get("launchStrategy");
  const skillRegistry = systemData.get("skillRegistry");

  const strategy = await loadStrategyFromString(content, format, {
    inputCollector,
    launchStrategy,
    skillRegistry,
    flowHooks,
    modelOverride,
    strategyDir: dirname(strategyPath),
    runId,
    previousTurns,
  });

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
