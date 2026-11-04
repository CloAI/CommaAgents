import type {
  ConversationHistory,
  ConversationRecord,
  ConversationRetentionEvent,
  LoadedStrategy,
  TimelineEvent,
} from "@comma-agents/core";
import type {
  RehydratedConversation,
  RehydratedConversationInput,
} from "./systems/systems.types";

/**
 * Find the latest persisted lifecycle start for a run.
 *
 * @param {readonly TimelineEvent[]} events - Timeline events to search.
 * @returns {Extract<TimelineEvent, { type: "run_started" }> | undefined} The latest start event, if present.
 * @internal
 */
export function findLatestRunStart(
  events: readonly TimelineEvent[],
): Extract<TimelineEvent, { type: "run_started" }> | undefined {
  return [...events]
    .reverse()
    .find(
      (event): event is Extract<TimelineEvent, { type: "run_started" }> =>
        event.type === "run_started",
    );
}

/**
 * Restore persisted conversation records into matching strategy agents.
 *
 * @param {LoadedStrategy} strategy - Loaded strategy whose agent contexts are restored.
 * @param {ConversationHistory} conversation - Persisted conversation to restore.
 * @returns {void} Nothing; mutates matching agent conversation contexts.
 * @internal
 */
export function restoreAgentContexts(
  strategy: LoadedStrategy,
  conversation: ConversationHistory,
): void {
  const recordsByAgent = new Map<string, ConversationRecord[]>();
  for (const record of conversation.records) {
    const records = recordsByAgent.get(record.agentName) ?? [];
    records.push(record);
    recordsByAgent.set(record.agentName, records);
  }

  for (const [agentName, agent] of Object.entries(strategy.agents)) {
    const records = recordsByAgent.get(agentName);
    if (records && records.length > 0) {
      agent.getConversationContext?.().importRecords(records);
    }
  }
}

/**
 * Rebuild conversation state and human-input anchors from timeline events.
 *
 * @param {readonly TimelineEvent[]} events - Timeline events to rehydrate.
 * @returns {RehydratedConversation} Rebuilt conversation records, retention events, and inputs.
 * @internal
 */
export function conversationHistoryFromEvents(
  events: readonly TimelineEvent[],
): RehydratedConversation {
  let records: ConversationRecord[] = [];
  const retentionEvents: ConversationRetentionEvent[] = [];
  const inputs: RehydratedConversationInput[] = [];
  let pendingInput: string | undefined;

  for (const event of events) {
    if (event.type === "run_started") {
      const text = event.initialInput;
      if (text !== undefined && text.length > 0) {
        if (pendingInput !== undefined) {
          inputs.push({ text: pendingInput });
        }
        pendingInput = text;
      }
    } else if (event.type === "user_input") {
      if (event.childId || event.source !== "human") {
        continue;
      }
      if (pendingInput !== undefined) {
        inputs.push({ text: pendingInput });
      }
      pendingInput = event.text;
    } else if (event.type === "agent_call") {
      if (event.childId) {
        continue;
      }
      if (pendingInput !== undefined) {
        inputs.push({ text: pendingInput, beforeRecordId: event.record.id });
        pendingInput = undefined;
      }
      records.push(event.record);
    } else if (event.type === "conversation_retention") {
      if (event.childId) {
        continue;
      }
      records = [...applyRetentionEvent(records, event.event)];
      retentionEvents.push(event.event);
    }
  }

  if (pendingInput !== undefined) {
    inputs.push({ text: pendingInput });
  }
  return { records, retentionEvents, inputs };
}

function applyRetentionEvent(
  records: readonly ConversationRecord[],
  event: ConversationRetentionEvent,
): readonly ConversationRecord[] {
  const supersededIds = new Set(event.supersededRecordIds);
  const nextRecords: ConversationRecord[] = [];
  let insertedSummary = false;

  for (const record of records) {
    if (record.id === event.summaryRecord.id) {
      continue;
    }
    if (
      event.insertBeforeRecordId !== undefined &&
      record.id === event.insertBeforeRecordId &&
      !insertedSummary
    ) {
      nextRecords.push(event.summaryRecord);
      insertedSummary = true;
    }

    nextRecords.push(
      supersededIds.has(record.id)
        ? {
            ...record,
            status: "superseded",
            supersededBy: event.summaryRecord.id,
          }
        : record,
    );
  }

  if (!insertedSummary) {
    nextRecords.push(event.summaryRecord);
  }
  return nextRecords;
}
