import type { AgentCallResult, AgentStreamEvent } from "@comma-agents/core";
import { isUserAgentDef } from "@comma-agents/core";
import type { RunSnapshot } from "../../../daemon-store";
import type { Logger } from "../../../logger";
import type { MessageSender } from "../../../server/protocol/dispatcher/dispatcher.types";
import {
  toAgentCallResultWire,
  toAgentStreamEventWire,
} from "../../../server/protocol/responses/from-core";
import {
  type AgentModelDetails,
  resolveAgentModelDetails,
} from "../../agent-model-details";
import type {
  DaemonSystem,
  StrategyLoadedContext,
  SystemDataStore,
} from "../systems.types";
import type { StreamingSystemOptions } from "./streaming.types";

export function createStreamingSystem(
  options: StreamingSystemOptions,
): DaemonSystem {
  const { logger, messageSender } = options;

  return {
    name: "streaming",

    onStrategyLoaded(strategyContext: StrategyLoadedContext): void {
      const { strategy, run, systemData } = strategyContext;

      systemData.set("lastAgentOutputText", null);

      const flowHooks = buildFlowHooks(run, messageSender);
      strategy.flow.appendHook?.("beforeStep", flowHooks.beforeStep);
      strategy.flow.appendHook?.("afterStep", flowHooks.afterStep);

      for (const [agentName, agent] of Object.entries(strategy.agents)) {
        if (!agent.appendHook) continue;

        const agentDefinition = strategy.raw.agents[agentName];
        const isUserAgent =
          agentDefinition !== undefined && isUserAgentDef(agentDefinition);
        const modelDetails = resolveAgentModelDetails(agent.config?.model);
        const agentHooks = buildAgentHooks(
          agentName,
          run,
          messageSender,
          logger,
          systemData,
          isUserAgent,
          modelDetails,
        );

        agent.appendHook("onStreamEvent", agentHooks.onStreamEvent);
        agent.appendHook("afterCallResult", agentHooks.afterCallResult);
      }
    },
  };
}

function buildFlowHooks(run: RunSnapshot, messageSender: MessageSender) {
  return {
    beforeStep({
      stepName,
      message,
    }: {
      stepName: string;
      message: string;
    }): void {
      const ts = new Date().toISOString();

      messageSender.broadcast(run.id, {
        type: "step_started",
        runId: run.id,
        stepName,
        message,
        ts,
      });
    },

    afterStep({
      stepName,
      result,
    }: {
      stepName: string;
      message: string;
      result: AgentCallResult;
    }): void {
      const ts = new Date().toISOString();

      messageSender.broadcast(run.id, {
        type: "step_completed",
        runId: run.id,
        stepName,
        result: toAgentCallResultWire(result),
        ts,
      });
    },
  };
}

function buildAgentHooks(
  agentName: string,
  run: RunSnapshot,
  messageSender: MessageSender,
  logger: Logger,
  systemData: SystemDataStore,
  isUserAgent: boolean,
  modelDetails: AgentModelDetails,
) {
  return {
    onStreamEvent(event: AgentStreamEvent): void {
      if (event.type === "tool-call" || event.type === "tool-result") {
        logToolEvent(run.id, agentName, event, logger);
      }

      if (isUserAgent) return;

      messageSender.broadcast(run.id, {
        type: "agent_streaming",
        runId: run.id,
        agentName,
        ...modelDetails,
        event: toAgentStreamEventWire(event),
        ts: new Date().toISOString(),
      });
    },

    afterCallResult(result: AgentCallResult): void {
      const ts = new Date().toISOString();

      if (!isUserAgent) {
        messageSender.broadcast(run.id, {
          type: "agent_output",
          runId: run.id,
          agentName,
          ...modelDetails,
          text: result.text,
          usage: {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
          },
          ...(result.contextUsage !== undefined
            ? { contextUsage: result.contextUsage }
            : {}),
          ts,
        });
      }

      systemData.set("lastAgentOutputText", result.text);
    },
  };
}

function logToolEvent(
  runId: string,
  agentName: string,
  event: AgentStreamEvent,
  logger: Logger,
): void {
  const tag = `[run ${runId.slice(0, 8)}]`;

  if (event.type === "tool-call") {
    logger.info(
      `${tag} agent=${agentName} tool-call: ${event.toolName} args=${previewForLog(event.args)}`,
    );
  } else if (event.type === "tool-result") {
    logger.info(
      `${tag} agent=${agentName} tool-result: ${event.toolName} output=${event.output.length} chars: ${previewForLog(event.output)}`,
    );
  }
}

function previewForLog(value: string): string {
  const limit = 200;
  const flattened = value.replace(/\r?\n/g, "\\n");
  if (flattened.length <= limit) return flattened;
  return `${flattened.slice(0, limit)}…`;
}
