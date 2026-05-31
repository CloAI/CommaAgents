import { readFileSync } from "node:fs";
import type { AgentHooks, FlowHooks, LoadedStrategy } from "@comma-agents/core";
import {
  hookIntoAgent,
  inSandbox,
  loadStrategyFromString,
} from "@comma-agents/core";
import type { Logger } from "../../logger/logger.types";
import type { EventSink } from "../../server/protocol/event-sink";
import type { SystemDataStore } from "./systems.types";

export interface PrepareStrategyOptions {
  readonly strategyPath: string;
  readonly modelOverride?: string;
  readonly cwd: string;
  readonly runId: string;
  readonly sink: EventSink;
  readonly systemData: SystemDataStore;
  readonly logger: Logger;
  readonly flowHooks?: FlowHooks;
  readonly agentHooks?: AgentHooks;
}

export async function prepareStrategy(
  options: PrepareStrategyOptions,
): Promise<LoadedStrategy> {
  const {
    strategyPath,
    modelOverride,
    cwd,
    runId,
    sink,
    systemData,
    logger,
    flowHooks,
    agentHooks,
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

  const strategy = await loadStrategyFromString(content, format, {
    inputCollector,
    launchStrategy,
    modelOverride,
    cwd,
    runId,
  });

  logger.info(
    `Strategy loaded: ${strategy.name} with ${Object.keys(strategy.agents).length} agents`,
  );

  if (flowHooks) {
    hookIntoAgent(strategy.flow, flowHooks);
  }

  if (agentHooks) {
    for (const [_agentName, agent] of Object.entries(strategy.agents)) {
      if (!agent.appendHook) continue;

      const isUserAgent = agent.config?.type === "user";

      if (!isUserAgent) {
        hookIntoAgent(agent, agentHooks);
      }
    }
  }

  const permissionBridge = systemData.get("permissionBridge");
  const questionBridge = systemData.get("questionBridge");

  if (!permissionBridge || !questionBridge) {
    throw new Error(
      "prepareStrategy requires InteractionBridgesSystem to run first",
    );
  }

  const sandboxConfig = {
    cwd,
    jail: false,
    allowAbsolutePaths: true,
    read: { default: "ask", allow: ["**"], deny: [] },
    write: { default: "ask", allow: ["**"], deny: [] },
    execute: { default: "ask", allow: ["**"], deny: [] },
  };

  const sandboxCallbacks = {
    onAsk: permissionBridge.requester,
    onQuestion: questionBridge.requester,
    onPolicyChange: (snapshot: {
      toolName: string;
      policies: unknown;
    }): void => {
      sink.broadcast(runId, {
        type: "policy_updated",
        runId,
        tool: snapshot.toolName,
        policies: snapshot.policies,
        ts: new Date().toISOString(),
      });
    },
  };

  const sandbox = inSandbox(strategy, sandboxConfig, sandboxCallbacks);
  systemData.set("sandbox", sandbox);

  return strategy;
}
