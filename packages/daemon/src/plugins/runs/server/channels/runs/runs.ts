import { defineChannel } from "../../../../../daemon-plugin";
import type { ChannelOpenResult } from "../../../../../daemon-plugin";
import { runsChannelMessage } from "./runs.utils";
import type { OpenRunsChannelOptions, RunsChannelMessage } from "./runs.types";
import { RunsArgumentsSchema, RunsMessageSchema } from "./runs.schemas";

/**
 * Hydrate a bounded view and replay cumulative blocks before enabling subsequent live updates.
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
  function cleanup(): void {
    for (const unsubscribe of unsubscribers.splice(0)) {
      unsubscribe();
    }
    channel.signal.removeEventListener("abort", cleanup);
  }
  channel.signal.addEventListener("abort", cleanup, { once: true });
  try {
    if (!(await plugin.getRun(runId))) {
      throw Object.assign(new Error(`Run not found: ${runId}`), {
        code: "RUN_NOT_FOUND",
      });
    }
    for (const type of [
      "run_snapshot",
      "run_message_stream",
      "run_message_output",
      "run_child",
      "run_input_requested",
      "run_input_resolved",
      "run_step",
      "run_steer_queued",
      "run_preparation_failed",
      "run_preparation_cancelled",
    ] as const) {
      channel.signal.throwIfAborted();
      const unsubscribe = await plugin.notifications.subscribe(
        type,
        runId,
        (notification) => {
          const origin =
            notification.type === "run_snapshot"
              ? notification.snapshot.runId
              : notification.runId;
          if (origin !== runId || initializing || channel.signal.aborted) {
            return;
          }
          const message = runsChannelMessage(notification);
          if (message) {
            channel.send(message);
          }
        },
      );
      unsubscribers.push(unsubscribe);
      if (channel.signal.aborted) {
        cleanup();
        channel.signal.throwIfAborted();
      }
    }
    while (true) {
      channel.signal.throwIfAborted();
      await Promise.all([...context.pendingWrites]);
      const revision = context.revision;
      const page = await plugin.getHistory(runId, {
        limit: history?.limit ?? 25,
      });
      if (revision !== context.revision || context.pendingWrites.size) {
        continue;
      }
      const snapshot = context.runs.get(runId)?.snapshot;
      if (!snapshot) {
        throw Object.assign(new Error(`Run not found: ${runId}`), {
          code: "RUN_NOT_FOUND",
        });
      }
      const pendingInputs = [...context.runs.get(runId)!.pendingInput].map(
        ([inputId, pending]) => ({
          runId,
          inputId,
          agentName: pending.agentName,
          prompt: pending.prompt,
        }),
      );
      channel.signal.throwIfAborted();
      const represented = new Set(page.entries.map((entry) => entry.messageId));
      for (const active of context.activeMessages.values()) {
        if (
          active.message.runId !== runId ||
          represented.has(active.message.messageId)
        ) {
          continue;
        }
        for (const [
          contentIndex,
          content,
        ] of active.message.content.entries()) {
          channel.send({
            type: "agent.stream",
            data: {
              runId,
              messageId: active.message.messageId,
              agentName: active.message.agentName!,
              createdAt: active.message.createdAt,
              contentIndex,
              content,
            },
          });
        }
      }
      initializing = false;
      return {
        initial: {
          type: "run.initial",
          data: { snapshot, history: page, pendingInputs },
        },
        cleanup,
      };
    }
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
