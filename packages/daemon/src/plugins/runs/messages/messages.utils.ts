import { createHash } from "node:crypto";
import type {
  ConversationRecord,
  AgentCallResult,
  TimelineEvent,
} from "@comma-agents/core";
import type { z } from "zod/v4";
import type { RunContent, RunHistoryEntry } from "./messages.types";

/**
 * Preserve JSON values at the display boundary without retaining SDK objects.
 * @param {unknown} value - Tool arguments or output.
 * @returns {z.infer<z.ZodJSONSchema>} Serializable value.
 * @internal
 */
export function messageJson(value: unknown): z.infer<z.ZodJSONSchema> {
  return JSON.parse(JSON.stringify(value ?? null)) as z.infer<z.ZodJSONSchema>;
}

/**
 * Project ordered response parts into display blocks for persisted and custom-execute results.
 * @param {Pick<ConversationRecord, "responseMessages" | "text"> | AgentCallResult} record - Completed invocation.
 * @returns {RunContent[]} Ordered visual content.
 * @internal
 */
export function responseContent(
  record:
    | Pick<ConversationRecord, "responseMessages" | "text">
    | AgentCallResult,
): RunContent[] {
  const content: RunContent[] = [];
  const tools = new Map<string, number>();
  for (const response of record.responseMessages) {
    if (typeof response.content === "string") {
      if (response.content) {
        content.push({ type: "text", text: response.content });
      }
      continue;
    }
    for (const part of response.content) {
      if (part.type === "text") {
        content.push({ type: "text", text: part.text });
      } else if (part.type === "reasoning") {
        content.push({ type: "reasoning", text: part.text });
      } else if (part.type === "tool-call") {
        tools.set(part.toolCallId, content.length);
        content.push({
          type: "tool",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          arguments: messageJson(part.input),
          status: "running",
        });
      } else if (part.type === "tool-result") {
        const index = tools.get(part.toolCallId);
        const tool = index === undefined ? undefined : content[index];
        if (tool?.type === "tool" && index !== undefined) {
          const output = part.output;
          const failed =
            output.type === "error-text" || output.type === "error-json";
          content[index] = {
            ...tool,
            status: failed ? "error" : "completed",
            output: messageJson("value" in output ? output.value : output),
            ...(failed
              ? {
                  error:
                    typeof output.value === "string"
                      ? output.value
                      : JSON.stringify(output.value),
                }
              : {}),
          };
        }
      }
    }
  }
  if (!content.length && record.text) {
    content.push({ type: "text", text: record.text });
  }
  return content;
}

/**
 * Recover display messages from existing execution timelines without exposing transitions.
 * @param {readonly TimelineEvent[]} events - Root-owned persisted timeline.
 * @param {string} runId - Conversation whose own messages are requested.
 * @returns {RunHistoryEntry[]} Display messages with deterministic identities for older user inputs.
 * @internal
 */
export function legacyDisplayEntries(
  events: readonly TimelineEvent[],
  runId: string,
): RunHistoryEntry[] {
  const entries: RunHistoryEntry[] = [];
  const rootId =
    events.find((event) => event.type === "run_started")?.runId ?? runId;
  for (const [eventIndex, event] of events.entries()) {
    if ((event.runId ?? rootId) !== runId) {
      continue;
    }
    if (event.type === "agent_call") {
      entries.push({
        type: "message",
        messageId: event.record.id,
        runId,
        parentRunId: event.parentRunId,
        role: "agent",
        agentName: event.record.agentName,
        createdAt: event.record.createdAt,
        status: "completed",
        content: responseContent(event.record),
      });
    } else if (
      (event.type === "run_started" && event.initialInput) ||
      event.type === "user_input"
    ) {
      entries.push({
        type: "message",
        messageId: createHash("sha256")
          .update(`${runId}:${eventIndex}:${event.ts}`)
          .digest("hex"),
        runId,
        parentRunId: event.parentRunId,
        role: "user",
        createdAt: event.ts,
        status: "completed",
        content: [
          {
            type: "text",
            text:
              event.type === "run_started" ? event.initialInput! : event.text,
          },
        ],
      });
    }
  }
  return entries;
}
