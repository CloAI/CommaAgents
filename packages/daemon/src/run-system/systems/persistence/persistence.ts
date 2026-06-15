import type {
  AgentHooks,
  FlowHooks,
  ResponseMessage,
  TimelineEvent,
  UserModelMessage,
} from "@comma-agents/core";
import type { Logger } from "../../../logger";
import type { RunState } from "../../../state";
import type { RunStore } from "../../run-store";
import type {
  CompletionContext,
  ErrorContext,
  ExecutionContext,
} from "../systems.types";
import type {
  PersistenceSystem,
  PersistenceSystemOptions,
} from "./persistence.types";

export function createPersistenceSystem(
  options: PersistenceSystemOptions,
): PersistenceSystem {
  const { logger, runStore } = options;

  return {
    name: "persistence",

    async onBeforeExecute({
      run,
      strategy,
      input,
      cwd,
      manifestPath,
      modelOverride,
    }: ExecutionContext): Promise<void> {
      try {
        await runStore.appendEvent(run.id, {
          type: "run_started",
          ts: new Date().toISOString(),
          strategyPath: run.strategyPath,
          strategyName: strategy.name,
          cwd,
          initialInput: input,
          ...(manifestPath !== undefined ? { manifestPath } : {}),
          ...(modelOverride !== undefined ? { modelOverride } : {}),
        });
      } catch (error) {
        logger.warn(
          `Failed to append run_started event for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const flowHooks = buildFlowHooks(run, runStore, logger);
      strategy.flow.appendHook("beforeStep", flowHooks.beforeStep);
      strategy.flow.appendHook("afterStep", flowHooks.afterStep);

      for (const [agentName, agent] of Object.entries(strategy.agents)) {
        if (!agent.appendHook) continue;

        const agentHooks = buildAgentHooks(agentName, run, runStore, logger);
        agent.appendHook("beforeCall", agentHooks.beforeCall);
        agent.appendHook("afterCallResult", agentHooks.afterCallResult);
      }
    },

    async onRunComplete(completionContext: CompletionContext): Promise<void> {
      const { run } = completionContext;

      try {
        await runStore.appendEvent(run.id, {
          type: "run_completed",
          ts: new Date().toISOString(),
          status: "completed",
        });
      } catch (error) {
        logger.warn(
          `Failed to append run_completed event for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },

    async onRunError(errorContext: ErrorContext): Promise<void> {
      const { run, classified } = errorContext;

      try {
        await runStore.appendEvent(run.id, {
          type: "run_completed",
          ts: new Date().toISOString(),
          status: classified.status,
          error: {
            code: classified.code,
            message: classified.message,
          },
        });
      } catch (error) {
        logger.warn(
          `Failed to append run_completed event for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

function buildFlowHooks(
  run: RunState,
  runStore: RunStore,
  logger: Logger,
): FlowHooks {
  return {
    beforeStep({ stepName }): void {
      appendEvent(runStore, logger, run.id, {
        type: "step_started",
        ts: new Date().toISOString(),
        stepName,
      });
    },

    afterStep({ stepName }): void {
      appendEvent(runStore, logger, run.id, {
        type: "step_completed",
        ts: new Date().toISOString(),
        stepName,
      });
    },
  };
}

function buildAgentHooks(
  agentName: string,
  run: RunState,
  runStore: RunStore,
  logger: Logger,
): AgentHooks {
  let pendingUserMessage: string | null = null;

  return {
    beforeCall(message: string): void {
      pendingUserMessage = message;
    },

    afterCallResult(result): void {
      const userMessage: UserModelMessage = {
        role: "user",
        content: pendingUserMessage ?? "",
      };
      pendingUserMessage = null;

      appendEvent(runStore, logger, run.id, {
        type: "agent_call",
        ts: new Date().toISOString(),
        agentName,
        userMessage,
        responseMessages: result.responseMessages as ResponseMessage[],
      });
    },
  };
}

function appendEvent(
  runStore: RunStore,
  logger: Logger,
  runId: string,
  event: TimelineEvent,
): void {
  runStore.appendEvent(runId, event).catch((error) => {
    logger.warn(
      `Failed to append ${event.type} event for run ${runId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}
