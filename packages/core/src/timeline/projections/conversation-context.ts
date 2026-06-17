import type { ModelMessage } from "ai";
import {
  type ConversationRecord,
  recordsToMessages,
} from "../../conversation-context";
import type { TimelineEvent } from "../timeline.types";

export interface ProjectedConversationContext {
  readonly records: readonly ConversationRecord[];
  readonly messages: readonly ModelMessage[];
  readonly length: number;
}

/**
 * Project agent-call events into canonical conversation records.
 *
 * @param events - Timeline events to project.
 * @param agentName - Optional agent name to filter by.
 * @example
 * ```ts
 * const context = projectConversationContext(events, "assistant");
 * ```
 */
export function projectConversationContext(
  events: readonly TimelineEvent[],
  agentName?: string,
): ProjectedConversationContext {
  const records: ConversationRecord[] = [];
  for (const event of events) {
    if (event.type !== "agent_call") continue;
    if (agentName !== undefined && event.record.agentName !== agentName) {
      continue;
    }
    records.push(event.record);
  }

  return {
    records,
    messages: recordsToMessages(records),
    length: records.length,
  };
}
