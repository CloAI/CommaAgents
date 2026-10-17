import type {
  ConversationHistory,
  ConversationRecord,
  ConversationRetentionEvent,
  TimelineEvent,
} from "@comma-agents/core";
import type { RunSnapshot } from "../runs.types";
import { validateRunTimeline } from "./history.validation";

/**
 * Restore root conversation records and retention summaries from a timeline.
 * @param {readonly TimelineEvent[]} events - Persisted timeline including child events.
 * @param {string} runId - Execution whose conversation should be restored.
 * @returns {ConversationHistory} Root conversation with applied retention events.
 * @internal
 */
export function conversationFromEvents(
  events: readonly TimelineEvent[],
  runId?: string,
): ConversationHistory {
  validateRunTimeline(events);
  let records: ConversationRecord[] = [];
  const retentionEvents: ConversationRetentionEvent[] = [];
  const executionId =
    runId ?? events.find((event) => event.type === "run_started")?.runId;
  for (const event of events) {
    if (event.runId && event.runId !== executionId) continue;
    if (event.type === "agent_call") {
      records.push(event.record);
    } else if (event.type === "conversation_retention") {
      const retention = event.event;
      const supersededIds = new Set(retention.supersededRecordIds);
      records = records
        .filter((record) => record.id !== retention.summaryRecord.id)
        .map<ConversationRecord>((record) =>
          supersededIds.has(record.id)
            ? {
                ...record,
                status: "superseded",
                supersededBy: retention.summaryRecord.id,
              }
            : record,
        );
      const summaryIndex = records.findIndex(
        (record) => record.id === retention.insertBeforeRecordId,
      );
      records.splice(
        summaryIndex < 0 ? records.length : summaryIndex,
        0,
        retention.summaryRecord,
      );
      retentionEvents.push(retention);
    }
  }
  return { records, retentionEvents };
}

/**
 * Restore the latest run segment, marking unfinished segments interrupted.
 * @param {string} runId - Stable run identifier.
 * @param {readonly TimelineEvent[]} events - Ordered persisted timeline.
 * @returns {RunSnapshot | undefined} Terminal snapshot, or undefined when no run started.
 * @internal
 */
export function snapshotFromEvents(
  runId: string,
  events: readonly TimelineEvent[],
): RunSnapshot | undefined {
  const starts = events.filter(
    (event): event is Extract<TimelineEvent, { type: "run_started" }> =>
      event.type === "run_started" && (!event.runId || event.runId === runId),
  );
  const latestStart = starts.at(-1);
  if (!latestStart) return undefined;

  const startIndex = events.lastIndexOf(latestStart);
  const completion = events
    .slice(startIndex + 1)
    .findLast(
      (event): event is Extract<TimelineEvent, { type: "run_completed" }> =>
        event.type === "run_completed" &&
        (!event.runId || event.runId === runId),
    );
  const mode: "new" | "continuation" =
    starts.length > 1 ? "continuation" : "new";
  const base = {
    runId,
    ...(latestStart.parentRunId
      ? { parentRunId: latestStart.parentRunId }
      : {}),
    phase: "terminal" as const,
    strategyPath: latestStart.strategyPath,
    strategyName: latestStart.strategyName,
    cwd: latestStart.cwd,
    mode,
  };

  if (!completion) {
    return {
      ...base,
      outcome: { status: "interrupted" },
    };
  }
  if (completion.status === "completed") {
    return {
      ...base,
      outcome: completion.result
        ? { status: "completed", summary: completion.result }
        : { status: "interrupted" },
    };
  }
  if (completion.error?.code === "PERSISTENCE_ERROR") {
    return {
      ...base,
      outcome: { status: "persistence_error", error: completion.error },
    };
  }
  return {
    ...base,
    outcome: {
      status: completion.status === "cancelled" ? "cancelled" : "failed",
      error: completion.error,
    },
  };
}
