import type { ConversationRecord } from "../../conversation-context.types";
import type { ConversationRetentionTrigger } from "../retention.types";

/** Summarize a span of records into a single plain-text summary. */
export type SummarizeRecords = (
  records: readonly ConversationRecord[],
) => Promise<string>;

/** Configuration for compacting older records into one summary record. */
export interface CompactionOptions {
  /** Number of most-recent active records kept verbatim. @default 8 */
  readonly keepRecent?: number;
  /** Active-record count that triggers compaction. @default keepRecent * 2 */
  readonly threshold?: number;
  /** Context usage ratio that triggers compaction. @default 0.85 */
  readonly thresholdRatio?: number;
  /** Summarizer used to fold older records into one summary. */
  readonly summarize?: SummarizeRecords;
}

/** Input for applying compaction to full retained record history. */
export interface ApplyCompactionInput {
  /** Full retained record history. */
  readonly records: readonly ConversationRecord[];
  /** Compaction configuration and summarizer. */
  readonly options: CompactionOptions;
  /** Agent that owns the synthetic summary record. */
  readonly agentName: string;
  /** Metadata used to decide whether compaction should run. */
  readonly trigger: ConversationRetentionTrigger;
}
