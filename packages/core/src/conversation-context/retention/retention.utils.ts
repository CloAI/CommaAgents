import type { ConversationRecord } from "../conversation-context.types";

/** Records that are still part of the agent's effective (LLM-visible) context. */
export function activeRecords(
  records: readonly ConversationRecord[],
): readonly ConversationRecord[] {
  return records.filter((record) => record.status !== "superseded");
}
