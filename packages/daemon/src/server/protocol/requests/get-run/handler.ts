// Handle a `get_run` request.
// Returns the full run file (including turns) for the given runId.

import type { TimelineEvent } from "@comma-agents/core";
import type { RunStatus } from "../../../../state/state.types";
import type { HandlerContext } from "../../dispatcher.types";
import type { GetRunMessage } from "./index";

export { GetRunMessage } from "./index";

export async function handleGetRun(
  message: GetRunMessage,
  context: HandlerContext<"get_run">,
): Promise<void> {
  const { runId } = message;
  const events = await context.runStore.getEvents(runId);
  const startEvent = events.find((ev) => ev.type === "run_started");

  if (!startEvent || startEvent.type !== "run_started") {
    context.reply({
      type: "error" as const,
      code: "NOT_FOUND",
      message: `Run not found: ${runId}`,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
    return;
  }

  // Find latest run_completed (if any)
  const completed = [...events]
    .reverse()
    .find((ev) => ev.type === "run_completed");

  let status: RunStatus = "running";
  let completedAt: string | null = null;
  let error: { code: string; message: string } | undefined;
  if (completed && completed.type === "run_completed") {
    status = completed.status;
    completedAt = completed.ts;
    error = completed.error;
  }

  // Project turns from agent_call events
  const turns = events
    .filter(
      (ev): ev is Extract<TimelineEvent, { type: "agent_call" }> =>
        ev.type === "agent_call",
    )
    .map((ev) => ({
      agentName: ev.agentName,
      userMessage: ev.userMessage,
      responseMessages: ev.responseMessages,
    }));

  context.reply({
    type: "run_loaded" as const,
    runId,
    cwd: startEvent.cwd,
    strategyName: startEvent.strategyName,
    strategyPath: startEvent.strategyPath,
    startedAt: startEvent.ts,
    completedAt,
    status,
    ...(error !== undefined ? { error } : {}),
    turns,
    ts: new Date().toISOString(),
    ...(message.requestId !== undefined
      ? { requestId: message.requestId }
      : {}),
  });
}
