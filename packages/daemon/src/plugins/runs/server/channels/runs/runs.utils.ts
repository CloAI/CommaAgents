import type { RunStatus } from "../../../runs.notifications";
import type { RunsChannelMessage } from "./runs.types";

/**
 * Translate domain notifications without exposing internal lifecycle envelopes.
 * @param {RunStatus} notification - Notification already scoped to this conversation.
 * @returns {RunsChannelMessage} Public message, excluding legacy per-chunk notifications.
 * @internal
 */
export function runsChannelMessage(
  notification: RunStatus,
): RunsChannelMessage {
  switch (notification.type) {
    case "run_agent_started": {
      const { type: _type, ...data } = notification;
      return { type: "agent.started", data };
    }
    case "run_snapshot":
      return { type: "run.state", data: notification.snapshot };
    case "run_message_stream": {
      const { type: _type, ...data } = notification;
      return { type: "agent.stream", data };
    }
    case "run_message_output":
      if (notification.message.role === "user") {
        return { type: "user.input", data: notification.message };
      }
      return { type: "agent.output", data: notification.message };
    case "run_child":
      return { type: "child.run", data: notification.entry };
    case "run_input_requested":
      return {
        type: "input.requested",
        data: {
          runId: notification.runId,
          inputId: notification.inputId,
          agentName: notification.agentName,
          prompt: notification.prompt,
        },
      };
    case "run_input_resolved":
      return {
        type: "input.resolved",
        data: { runId: notification.runId, inputId: notification.inputId },
      };
    case "run_step":
      return {
        type: "run.step",
        data: {
          runId: notification.runId,
          phase: notification.phase,
          stepName: notification.stepName,
        },
      };
    case "run_steer_queued":
      return {
        type: "run.steer.queued",
        data: { runId: notification.runId, text: notification.text },
      };
    case "run_error":
      return {
        type: "run.error",
        data: { runId: notification.runId, error: notification.error },
      };
  }
}
