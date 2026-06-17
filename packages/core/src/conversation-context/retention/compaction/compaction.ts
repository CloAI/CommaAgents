import type { ConversationRecord } from "../../conversation-context.types";
import { activeRecords } from "../retention.utils";
import {
  COMPACTION_SUMMARY_REQUEST,
  DEFAULT_COMPACTION_KEEP_RECENT,
} from "./compaction.constants";
import type { CompactionOptions } from "./compaction.types";

/**
 * Compact older active records into one summary record.
 *
 * @param records - Full retained record history.
 * @param options - Compaction configuration and summarizer.
 * @param agentName - Agent that owns the synthetic summary record.
 * @example
 * ```ts
 * const prepared = await applyCompaction(records, {
 *   keepRecent: 8,
 *   summarize,
 * }, "assistant");
 * ```
 */
export async function applyCompaction(
  records: readonly ConversationRecord[],
  options: CompactionOptions,
  agentName: string,
): Promise<readonly ConversationRecord[]> {
  if (options.summarize === undefined) {
    throw new Error(
      "Conversation context compaction requires a summarize function. " +
        "Agents with a model configure this automatically.",
    );
  }

  const keepRecent = Math.max(
    0,
    options.keepRecent ?? DEFAULT_COMPACTION_KEEP_RECENT,
  );
  const threshold = Math.max(
    options.threshold ?? keepRecent * 2,
    keepRecent + 1,
  );
  const active = activeRecords(records);
  if (active.length <= threshold) return records;

  const olderRecords = active.slice(0, active.length - keepRecent);
  const recentRecords = active.slice(active.length - keepRecent);
  const summaryText = await options.summarize(olderRecords);
  const summaryRecord: ConversationRecord = {
    id: crypto.randomUUID(),
    agentName,
    createdAt: new Date().toISOString(),
    userMessage: { role: "user", content: COMPACTION_SUMMARY_REQUEST },
    responseMessages: [
      { role: "assistant", content: [{ type: "text", text: summaryText }] },
    ],
    text: summaryText,
    usage: { promptTokens: 0, completionTokens: 0 },
    finishReason: "stop",
    status: "active",
  };

  const supersededIds = new Set(olderRecords.map((record) => record.id));
  const anchorId = recentRecords[0]?.id;
  const compactedRecords: ConversationRecord[] = [];
  let insertedSummary = false;

  for (const record of records) {
    if (anchorId !== undefined && record.id === anchorId && !insertedSummary) {
      compactedRecords.push(summaryRecord);
      insertedSummary = true;
    }

    compactedRecords.push(
      supersededIds.has(record.id)
        ? { ...record, status: "superseded", supersededBy: summaryRecord.id }
        : record,
    );
  }

  if (!insertedSummary) {
    compactedRecords.push(summaryRecord);
  }

  return compactedRecords;
}
