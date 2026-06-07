import type {
  AgentCallResult,
  AgentHooks,
  AgentStreamEvent,
  FlowHooks,
  ResponseMessage,
  UserModelMessage,
} from "@comma-agents/core";
import { isUserAgentDef } from "@comma-agents/core";
import type { Logger } from "../../../logger";
import type { RunStore } from "../../../runs";
import type { RunState } from "../../../state";
import type { EventSink } from "../../event-sink";
import type { DaemonSystem, StrategyLoadedContext } from "../systems.types";

export interface StreamingSystemOptions {
  readonly logger: Logger;
  readonly runStore: RunStore;
  readonly sink: EventSink;
}

export function createStreamingSystem(
  options: StreamingSystemOptions,
): DaemonSystem {
  const { logger, runStore, sink } = options;

  return {
    name: "streaming",

    onStrategyLoaded(strategyContext: StrategyLoadedContext): void {
      const { strategy, run, systemData } = strategyContext;

      systemData.set("lastAgentOutputText", null);

      const flowHooks = buildFlowHooks(run, sink, runStore, logger);
      strategy.flow.appendHook("beforeStep", flowHooks.beforeStep);
      strategy.flow.appendHook("afterStep", flowHooks.afterStep);

      for (const [agentName, agent] of Object.entries(strategy.agents)) {
        if (!agent.appendHook) continue;

        const agentDefinition = strategy.raw.agents[agentName];
        const isUserAgent =
          agentDefinition !== undefined && isUserAgentDef(agentDefinition);
        const agentHooks = buildAgentHooks(
          agentName,
          run,
          sink,
          runStore,
          logger,
          systemData,
          isUserAgent,
        );

        agent.appendHook("beforeCall", agentHooks.beforeCall);
        agent.appendHook("onStreamEvent", agentHooks.onStreamEvent);
        agent.appendHook("afterCallResult", agentHooks.afterCallResult);
      }
    },
  };
}

function buildFlowHooks(
  run: RunState,
  sink: EventSink,
  runStore: RunStore,
  logger: Logger,
): FlowHooks {
  return {
    beforeStep({ stepName, message }): void {
      const ts = new Date().toISOString();

      sink.broadcast(run.id, {
        type: "step_started",
        runId: run.id,
        stepName,
        message,
        ts,
      });

      runStore
        .appendEvent(run.id, {
          type: "step_started",
          ts,
          stepName,
        })
        .catch((error) => {
          logger.warn(
            `Failed to append step_started event for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    },

    afterStep({ stepName, message: _message, result }): void {
      const ts = new Date().toISOString();

      sink.broadcast(run.id, {
        type: "step_completed",
        runId: run.id,
        stepName,
        result: toWireResult(result),
        ts,
      });

      runStore
        .appendEvent(run.id, {
          type: "step_completed",
          ts,
          stepName,
        })
        .catch((error) => {
          logger.warn(
            `Failed to append step_completed event for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    },
  };
}

function buildAgentHooks(
  agentName: string,
  run: RunState,
  sink: EventSink,
  runStore: RunStore,
  logger: Logger,
  systemData: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
  },
  isUserAgent: boolean,
): AgentHooks {
  let pendingUserMessage: string | null = null;

  return {
    beforeCall(message: string): void {
      pendingUserMessage = message;
    },

    onStreamEvent(event: AgentStreamEvent): void {
      if (event.type === "tool-call" || event.type === "tool-result") {
        logToolEvent(run.id, agentName, event, logger);
      }

      if (isUserAgent) return;

      sink.broadcast(run.id, {
        type: "agent_streaming",
        runId: run.id,
        agentName,
        event: toWireStreamEvent(event),
        ts: new Date().toISOString(),
      });
    },

    afterCallResult(result: AgentCallResult): void {
      const ts = new Date().toISOString();

      if (!isUserAgent) {
        sink.broadcast(run.id, {
          type: "agent_output",
          runId: run.id,
          agentName,
          text: result.text,
          usage: {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
          },
          ts,
        });
      }

      systemData.set("lastAgentOutputText", result.text);

      const userMessage: UserModelMessage = {
        role: "user",
        content: pendingUserMessage ?? "",
      };

      pendingUserMessage = null;

      runStore
        .appendEvent(run.id, {
          type: "agent_call",
          ts,
          agentName,
          userMessage,
          responseMessages: result.responseMessages as ResponseMessage[],
        })
        .catch((error) => {
          logger.warn(
            `Failed to append agent_call event for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
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

function toWireResult(result: AgentCallResult): {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
  finishReason: string;
} {
  return {
    text: result.text,
    usage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    },
    finishReason: result.finishReason,
  };
}

function toWireStreamEvent(event: AgentStreamEvent): unknown {
  if (event.type === "done") {
    return {
      type: "done",
      result: toWireResult(event.result),
    };
  }
  return event;
}
