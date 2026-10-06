import { getLogger } from "@logtape/logtape";
import type {
  Agent,
  AgentStreamEvent,
  TimelineEvent,
} from "@comma-agents/core";
import type { RunSnapshot } from "../../../server/daemon-store";
import type { RunRepository } from "../../run-repository";
import type { ExecutionContext } from "../systems.types";
import type {
  PersistenceSystem,
  PersistenceSystemOptions,
} from "./persistence.types";

const logger = getLogger(["comma", "daemon", "persistence"]);

export function createPersistenceSystem(
  options: PersistenceSystemOptions,
): PersistenceSystem {
  const { runRepository } = options;

  return {
    name: "persistence",
    onBeforeExecute({ run, strategy }: ExecutionContext): void {
      const flowHooks = buildFlowHooks(run, runRepository);
      strategy.flow.appendHook?.("beforeStep", flowHooks.beforeStep);
      strategy.flow.appendHook?.("afterStep", flowHooks.afterStep);

      for (const agent of Object.values(strategy.agents)) {
        if (!agent.appendHook) continue;

        const agentHooks = buildAgentHooks(agent, run, runRepository);
        agent.appendHook("onStreamEvent", agentHooks.onStreamEvent);
        agent.appendHook("afterCallResult", agentHooks.afterCallResult);
      }
    },
  };
}

function buildFlowHooks(run: RunSnapshot, runRepository: RunRepository) {
  return {
    beforeStep({ stepName }: { stepName: string }): void {
      appendEvent(runRepository, run.id, {
        type: "step_started",
        ts: new Date().toISOString(),
        stepName,
      });
    },
    afterStep({ stepName }: { stepName: string }): void {
      appendEvent(runRepository, run.id, {
        type: "step_completed",
        ts: new Date().toISOString(),
        stepName,
      });
    },
  };
}

function buildAgentHooks(
  agent: Agent,
  run: RunSnapshot,
  runRepository: RunRepository,
) {
  return {
    onStreamEvent(event: AgentStreamEvent): void {
      if (event.type !== "retention") return;

      appendEvent(runRepository, run.id, {
        type: "conversation_retention",
        ts: event.event.createdAt,
        event: event.event,
      });
    },
    afterCallResult(): void {
      const record = agent.getConversationContext?.().records().at(-1);
      if (!record) {
        logger.warning(
          `No conversation record available to persist for agent ${agent.name} in run ${run.id}`,
        );
        return;
      }

      appendEvent(runRepository, run.id, {
        type: "agent_call",
        ts: record.createdAt,
        record,
      });
    },
  };
}

function appendEvent(
  runRepository: RunRepository,
  runId: string,
  event: TimelineEvent,
): void {
  runRepository.appendEvent(runId, event).catch((error) => {
    logger.warning(
      `Failed to append ${event.type} event for run ${runId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}
