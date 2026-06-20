import type { ConversationRecord } from "../../conversation-context.types";
import type { ConversationRetentionEvent } from "../retention.types";
import { activeRecords } from "../retention.utils";
import {
  COMPACTION_SUMMARY_REQUEST,
  DEFAULT_COMPACTION_KEEP_RECENT,
  DEFAULT_COMPACTION_THRESHOLD_RATIO,
} from "./compaction.constants";
import type { ApplyCompactionInput } from "./compaction.types";

/**
 * Compact older active records into one summary record.
 *
 * @param input - Full retained record history, options, agent name, and trigger metadata.
 * @example
 * ```ts
 * const result = await applyCompaction({
 *   records,
 *   options: { keepRecent: 8, summarize },
 *   agentName: "assistant",
 *   trigger: { contextUsage: { totalTokens: 90_000 }, tokenLimit: 100_000 },
 * });
 * ```
 */
export async function applyCompaction(input: ApplyCompactionInput): Promise<{
  readonly records: readonly ConversationRecord[];
  readonly event?: ConversationRetentionEvent;
}> {
  const { records, options, agentName, trigger } = input;

  const keepRecent = Math.max(
    0,
    options.keepRecent ?? DEFAULT_COMPACTION_KEEP_RECENT,
  );
  const active = activeRecords(records);
  const thresholdRatio =
    options.thresholdRatio ?? DEFAULT_COMPACTION_THRESHOLD_RATIO;
  const tokenLimit = trigger.tokenLimit;
  const totalTokens = trigger.contextUsage?.totalTokens;
  const tokenRatio =
    tokenLimit !== undefined && totalTokens !== undefined
      ? totalTokens / tokenLimit
      : undefined;
  const recordThreshold =
    options.threshold !== undefined
      ? Math.max(options.threshold, keepRecent + 1)
      : undefined;

  let reason: "context-window" | "record-count" | undefined;
  if (tokenRatio !== undefined && tokenRatio >= thresholdRatio) {
    reason = "context-window";
  } else if (recordThreshold !== undefined && active.length > recordThreshold) {
    reason = "record-count";
  }

  if (reason === undefined) return { records };
  if (options.summarize === undefined) {
    throw new Error(
      "Conversation context compaction requires a summarize function. " +
        "Agents with a model configure this automatically.",
    );
  }

  const olderRecords = active.slice(0, active.length - keepRecent);
  const recentRecords = active.slice(active.length - keepRecent);
  if (olderRecords.length === 0) return { records };

  const createdAt = new Date().toISOString();
  const summaryText = await options.summarize(olderRecords);
  const summaryRecord: ConversationRecord = {
    id: crypto.randomUUID(),
    agentName,
    createdAt,
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

  return {
    records: compactedRecords,
    event: {
      id: crypto.randomUUID(),
      agentName,
      createdAt,
      kind: "compaction",
      reason,
      trigger: {
        ...trigger,
        ...(tokenRatio !== undefined ? { ratio: tokenRatio } : {}),
        thresholdRatio,
        activeRecordCount: active.length,
        ...(recordThreshold !== undefined ? { recordThreshold } : {}),
      },
      recordsCompacted: olderRecords.length,
      recordsRetained: recentRecords.length,
      summaryRecord,
      supersededRecordIds: [...supersededIds],
      ...(anchorId !== undefined ? { insertBeforeRecordId: anchorId } : {}),
    },
  };
}
