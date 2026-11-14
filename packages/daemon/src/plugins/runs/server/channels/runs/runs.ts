import { getRunSnapshot } from "../../../state/state";
import { runSnapshot } from "../../../state/state.utils";
import { runError, RunErrorCode } from "../../../errors";
import { defineChannel } from "../../../../../daemon-plugin";
import type { ChannelOpenResult } from "../../../../../daemon-plugin";
import { runsChannelMessage } from "./runs.utils";
import type { OpenRunsChannelOptions, RunsChannelMessage } from "./runs.types";
import { RunsArgumentsSchema, RunsMessageSchema } from "./runs.schemas";

/**
 * Read one initial history page and hand buffered updates over to live delivery.
 * @param {OpenRunsChannelOptions} options - Owning service, private state, and subscription operations.
 * @returns {Promise<ChannelOpenResult<RunsChannelMessage>>} Initial state and exactly-once listener cleanup.
 * @internal
 */
async function openRunsChannel({
  plugin,
  context,
  arguments: { runId, history },
  channel,
}: OpenRunsChannelOptions): Promise<ChannelOpenResult<RunsChannelMessage>> {
  const unsubscribers: Array<() => void> = [];
  let initializing = true;
  const buffered: RunsChannelMessage[] = [];

  function cleanup(): void {
    for (const unsubscribe of unsubscribers.splice(0)) {
      unsubscribe();
    }
    buffered.length = 0;
    channel.signal.removeEventListener("abort", cleanup);
  }

  channel.signal.addEventListener("abort", cleanup, { once: true });

  try {
    const saved = await getRunSnapshot(context, runId);

    if (saved === undefined) {
      throw runError({ code: RunErrorCode.RUN_NOT_FOUND, metadata: { runId } });
    }

    channel.signal.throwIfAborted();

    // Buffer notifications while loading history; execution never needs to become idle.
    for (const type of [
      "run_snapshot",
      "run_agent_started",
      "run_message_stream",
      "run_message_output",
      "run_child",
      "run_input_requested",
      "run_input_resolved",
      "run_step",
      "run_steer_queued",
      "run_error",
    ] as const) {
      const unsubscribe = await plugin.notifications.subscribe(
        type,
        runId,
        (notification) => {
          const origin =
            notification.type === "run_snapshot"
              ? notification.snapshot.runId
              : notification.runId;
          if (origin !== runId || channel.signal.aborted) {
            return;
          }
          const message = runsChannelMessage(notification);

          if (!initializing) {
            channel.send(message);
            return;
          }
          // Current state and partial text are captured after the read; only retain other events.
          switch (message.type) {
            case "run.state":
            case "agent.stream":
            case "agent.started":
            case "input.requested":
            case "input.resolved":
              break;
            default:
              buffered.push(message);
          }
        },
      );

      unsubscribers.push(unsubscribe);
      // A disconnect during registration must also release this newly acquired listener.
      channel.signal.throwIfAborted();
    }

    let historyPage = await plugin.getHistory(runId, {
      limit: history.limit,
    });
    channel.signal.throwIfAborted();

    // Capture current state and partial output after the read, without another asynchronous gap.
    const runtime = context.runs.get(runId);
    const snapshot = runtime === undefined ? saved : runSnapshot(runtime);

    // A switch can commit after the history page was read but before this snapshot.
    for (const change of snapshot.strategyState?.changes ?? []) {
      if (
        change.revision > (saved.strategyState?.revision ?? 0) &&
        !historyPage.entries.some(
          (entry) => entry.messageId === change.messageId,
        )
      ) {
        historyPage = {
          ...historyPage,
          entries: [...historyPage.entries, change],
        };
      }
    }

    const pendingInputs =
      runtime === undefined
        ? []
        : [...runtime.pendingInput].map(([inputId, pending]) => ({
            runId,
            inputId,
            agentName: pending.agentName,
            prompt: pending.prompt,
          }));

    const represented = new Set(
      historyPage.entries.map((entry) => entry.messageId),
    );
    const activeAgents = [...(runtime?.activeMessages.values() ?? [])]
      .filter(
        ({ message }) =>
          runtime?.state.phase === "running" &&
          runtime.state.strategy.agents[message.agentName]?.config?.model !==
            undefined,
      )
      .map(({ message }) => ({
        runId,
        messageId: message.messageId,
        agentName: message.agentName,
        createdAt: message.createdAt,
      }));

    for (const active of runtime?.activeMessages.values() ?? []) {
      if (!represented.has(active.message.messageId)) {
        for (const [
          contentIndex,
          content,
        ] of active.message.content.entries()) {
          channel.send({
            type: "agent.stream",
            data: {
              runId,
              messageId: active.message.messageId,
              agentName: active.message.agentName,
              createdAt: active.message.createdAt,
              ...(active.message.model !== undefined
                ? { model: active.message.model }
                : {}),
              ...(active.message.contextWindow !== undefined
                ? { contextWindow: active.message.contextWindow }
                : {}),
              contentIndex,
              content,
            },
          });
        }
      }
    }

    // Deliver missing final messages and transient events; coalesce child references to their latest state.
    const latestChildren = new Map<string, RunsChannelMessage>();
    for (const message of buffered) {
      if (message.type === "child.run") {
        latestChildren.set(message.data.messageId, message);
      }
    }

    for (const message of buffered.splice(0)) {
      switch (message.type) {
        case "agent.output":
        case "user.input":
          if (!represented.has(message.data.messageId)) {
            channel.send(message);
          }
          break;
        case "child.run":
          if (latestChildren.get(message.data.messageId) === message) {
            channel.send(message);
          }
          break;
        default:
          channel.send(message);
      }
    }

    initializing = false;

    return {
      initial: {
        type: "run.initial",
        data: {
          snapshot,
          history: historyPage,
          pendingInputs,
          activeAgents,
        },
      },
      cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

export const runsChannel = defineChannel({
  name: "runs",
  arguments: RunsArgumentsSchema,
  message: RunsMessageSchema,
  open: openRunsChannel,
});
