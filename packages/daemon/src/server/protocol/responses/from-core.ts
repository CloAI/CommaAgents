import type {
  AgentCallResult,
  AgentStreamEvent,
  ConversationRecord,
  ConversationRetentionEvent,
} from "@comma-agents/core";
import type { AgentStreamEventWire } from "./agent-streaming/agent-streaming.schema";
import type {
  AgentCallResultWire,
  ConversationRecordWire,
  ConversationRetentionEventWire,
} from "./shared";

/**
 * Project a core agent call result onto the wire contract.
 *
 * @param {AgentCallResult} result - Core agent call result to serialize.
 * @returns {AgentCallResultWire} Wire-safe agent call result.
 */
export function toAgentCallResultWire(
  result: AgentCallResult,
): AgentCallResultWire {
  return {
    text: result.text,
    usage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    },
    ...(result.contextUsage !== undefined
      ? { contextUsage: result.contextUsage }
      : {}),
    finishReason: result.finishReason,
  };
}

/**
 * Project a core conversation record onto the wire contract.
 *
 * @param {ConversationRecord} record - Core conversation record to serialize.
 * @returns {ConversationRecordWire} Wire-safe conversation record.
 */
export function toConversationRecordWire(
  record: ConversationRecord,
): ConversationRecordWire {
  return {
    id: record.id,
    agentName: record.agentName,
    createdAt: record.createdAt,
    userMessage: record.userMessage,
    responseMessages: [...record.responseMessages],
    text: record.text,
    usage: {
      promptTokens: record.usage.promptTokens,
      completionTokens: record.usage.completionTokens,
    },
    ...(record.contextUsage !== undefined
      ? { contextUsage: record.contextUsage }
      : {}),
    finishReason: record.finishReason,
    ...(record.status !== undefined ? { status: record.status } : {}),
    ...(record.supersededBy !== undefined
      ? { supersededBy: record.supersededBy }
      : {}),
  };
}

/**
 * Project a core conversation retention event onto the wire contract.
 *
 * @param {ConversationRetentionEvent} event - Core retention event to serialize.
 * @returns {ConversationRetentionEventWire} Wire-safe retention event.
 */
export function toConversationRetentionEventWire(
  event: ConversationRetentionEvent,
): ConversationRetentionEventWire {
  return {
    id: event.id,
    agentName: event.agentName,
    createdAt: event.createdAt,
    kind: event.kind,
    reason: event.reason,
    trigger: event.trigger,
    recordsCompacted: event.recordsCompacted,
    recordsRetained: event.recordsRetained,
    summaryRecord: toConversationRecordWire(event.summaryRecord),
    supersededRecordIds: [...event.supersededRecordIds],
    ...(event.insertBeforeRecordId !== undefined
      ? { insertBeforeRecordId: event.insertBeforeRecordId }
      : {}),
  };
}

/**
 * Project a core agent stream event onto the wire contract.
 *
 * The text/tool/thinking/step variants share core's shape exactly and pass
 * through; `retention` and `done` carry richer core structures that are mapped
 * down to their wire projections.
 *
 * @param {AgentStreamEvent} event - Core stream event to serialize.
 * @returns {AgentStreamEventWire} Corresponding protocol stream event.
 */
export function toAgentStreamEventWire(
  event: AgentStreamEvent,
): AgentStreamEventWire {
  switch (event.type) {
    case "text":
    case "tool-call":
    case "tool-result":
    case "thinking-start":
    case "thinking":
    case "thinking-end":
    case "step-start":
      return event;
    case "retention":
      return {
        type: "retention",
        event: toConversationRetentionEventWire(event.event),
      };
    case "done":
      return { type: "done", result: toAgentCallResultWire(event.result) };
  }
}
