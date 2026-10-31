import type {
  ConversationHistory,
  ConversationRecord,
  ConversationRetentionEvent,
  LoadedStrategy,
} from "@comma-agents/core";
import type { ConversationEvent } from "./conversation.types";
import type { RunEntry, RunsContext } from "../state/state.types";
import { handoffContextRecords } from "../switching/switching.utils";

/** Restore native records written after the current shared-context boundary.
 * @param {RunsContext} context - Run storage.
 * @param {RunEntry} entry - Run whose context is being restored.
 * @returns {Promise<ConversationHistory>} Canonical conversation following the shared seed.
 */
export async function restoredConversation(
  context: RunsContext,
  entry: RunEntry,
): Promise<ConversationHistory> {
  const events = await context.storage.conversation(entry.runId);
  const state = entry.strategyState;
  if (!state) return conversationFromEvents(events);
  // Target agent names are supplied after loading; shared seeds are imported separately.
  return conversationFromEvents(events.slice(state.handoff.eventOffset));
}
/**
 *  Rebuild effective agent context from already validated records and retention events.
 * @param {readonly ConversationEvent[]} events - Validated records and retention changes.
 * @returns {ConversationHistory} Canonical history with retention applied.
 * @internal
 */
export function conversationFromEvents(
  events: readonly ConversationEvent[],
): ConversationHistory {
  let records: ConversationRecord[] = [];
  const retentionEvents: ConversationRetentionEvent[] = [];
  for (const event of events) {
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
 *  Import records into their owning agents without depending on the legacy daemon.
 * @param {LoadedStrategy} strategy - Loaded executable strategy.
 * @param {ConversationHistory} conversation - Restored canonical conversation.
 * @param {RunEntry} [entry] - Shared context and its revision, when switching strategies.
 * @returns {void} Nothing after matching contexts are imported.
 * @internal
 */
export function restoreAgentContexts(
  strategy: LoadedStrategy,
  conversation: ConversationHistory,
  entry?: RunEntry,
): void {
  const recordsByAgent = new Map<string, ConversationRecord[]>();
  for (const record of conversation.records) {
    const records = recordsByAgent.get(record.agentName) ?? [];
    records.push(record);
    recordsByAgent.set(record.agentName, records);
  }
  for (const [agentName, agent] of Object.entries(strategy.agents)) {
    const records = recordsByAgent.get(agentName);
    if (agent.getConversationContext !== undefined) {
      const seed = entry?.strategyState
        ? handoffContextRecords(entry.strategyState, agentName)
        : [];
      // Retention events may supersede seed records as well as native records.
      const restored = conversationFromEvents([
        ...seed.map((record) => ({ type: "agent_call" as const, record })),
        ...(records ?? []).map((record) => ({
          type: "agent_call" as const,
          record,
        })),
        ...conversation.retentionEvents
          .filter((event) => event.agentName === agentName)
          .map((event) => ({ type: "conversation_retention" as const, event })),
      ]);
      if (restored.records.length > 0)
        agent.getConversationContext().importRecords(restored.records);
    }
  }
}
