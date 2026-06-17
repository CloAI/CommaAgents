import type { ConversationRecord } from "../../conversation-context.types";

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
  /** Summarizer used to fold older records into one summary. */
  readonly summarize?: SummarizeRecords;
}
