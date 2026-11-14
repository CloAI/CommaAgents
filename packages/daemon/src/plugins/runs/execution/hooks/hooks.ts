import type {
  AgentCallIdentity,
  AgentCallFailure,
  AgentCallResult,
  AgentStreamEvent,
  LoadedStrategy,
} from "@comma-agents/core";
import type { RunEntry, RunsContext } from "../../state/state.types";
import { persistRunWrite } from "../../history/persistence";
import {
  startAgentMessage,
  streamAgentMessage,
  completeAgentMessage,
  interruptAgentMessages,
} from "../../messages";
/**
 *  Attach flow progress, steering, canonical persistence and display instrumentation.
 * @param {RunsContext} context - Private runs state.
 * @param {RunEntry} entry - Run that owns the operation.
 * @param {LoadedStrategy} strategy - Loaded executable strategy.
 * @returns {void} Nothing after available hooks are attached.
 * @internal
 */
export function attachRunHooks(
  context: RunsContext,
  entry: RunEntry,
  strategy: LoadedStrategy,
): void {
  const runId = entry.runId;
  strategy.flow.appendHook?.(
    "beforeStep",
    ({ stepName }: { stepName: string }) => {
      context.notifications.notify(runId, {
        type: "run_step",
        runId,
        phase: "started",
        stepName,
      });
    },
  );
  strategy.flow.appendHook?.(
    "afterStep",
    ({ stepName }: { stepName: string }) => {
      context.notifications.notify(runId, {
        type: "run_step",
        runId,
        phase: "completed",
        stepName,
      });
    },
  );
  for (const [agentName, agent] of Object.entries(strategy.agents)) {
    if (agent.appendHook === undefined) {
      continue;
    }
    const definition = strategy.raw.agents[agentName];
    const interactive =
      definition?.type === "user" && definition.config?.requireInput !== false;
    agent.appendHook("onCallStarted", async (identity: AgentCallIdentity) => {
      if (interactive) {
        return;
      }
      await startAgentMessage(context, entry, agentName, identity);
      if (agent.config?.model !== undefined) {
        context.notifications.notify(runId, {
          type: "run_agent_started",
          runId,
          agentName,
          ...identity,
        });
      }
    });
    agent.appendHook("onCallFailed", (failure: AgentCallFailure) =>
      interactive
        ? undefined
        : interruptAgentMessages(
            context,
            entry,
            failure.cancelled || entry.controller.signal.aborted
              ? "stopped"
              : "failed",
            failure.messageId,
          ),
    );
    agent.appendHook("onStreamEvent", async (event: AgentStreamEvent) => {
      if (event.type === "retention") {
        await persistRunWrite(
          entry,
          context.storage.append(runId, {
            type: "conversation_retention",
            event: event.event,
          }),
        );
      } else if (!interactive) {
        await streamAgentMessage(context, entry, agentName, event);
      }
    });
    agent.appendHook("onCallCompleted", async (result: AgentCallResult) => {
      const record = agent
        .getConversationContext?.()
        .records()
        .find((record) => record.id === result.messageId);
      if (record !== undefined) {
        await persistRunWrite(
          entry,
          context.storage.append(runId, { type: "agent_call", record }),
        );
      }
      if (interactive) {
        return;
      }
      if (result.finishReason === "user_steering") {
        await interruptAgentMessages(
          context,
          entry,
          "stopped",
          result.messageId,
          "user_steering",
        );
      } else {
        await completeAgentMessage(context, entry, agentName, result, record);
      }
    });
  }
}
