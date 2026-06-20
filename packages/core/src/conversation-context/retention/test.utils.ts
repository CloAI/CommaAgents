import type {
  ConversationRecord,
  ConversationRecordStatus,
} from "../conversation-context.types";

/** Build a minimal conversation record for retention tests. */
export function makeRecord(
  id: string,
  options?: {
    readonly agentName?: string;
    readonly status?: ConversationRecordStatus;
    readonly contextUsage?: ConversationRecord["contextUsage"];
  },
): ConversationRecord {
  return {
    id,
    agentName: options?.agentName ?? "assistant",
    createdAt: `2026-01-01T00:00:${id.padStart(2, "0")}.000Z`,
    userMessage: { role: "user", content: `q-${id}` },
    responseMessages: [
      { role: "assistant", content: [{ type: "text", text: `a-${id}` }] },
    ],
    text: `a-${id}`,
    usage: { promptTokens: 1, completionTokens: 1 },
    finishReason: "stop",
    ...(options?.status ? { status: options.status } : {}),
    ...(options?.contextUsage !== undefined
      ? { contextUsage: options.contextUsage }
      : {}),
  };
}

/** Build a test summarizer that records the spans it receives. */
export function countingSummarizer() {
  const calls: ConversationRecord[][] = [];
  return {
    calls,
    summarize: async (records: readonly ConversationRecord[]) => {
      calls.push([...records]);
      return `summary-of-${records.map((record) => record.id).join("+")}`;
    },
  };
}
