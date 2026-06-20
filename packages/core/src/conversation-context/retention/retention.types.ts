import type {
  ContextUsage,
  ConversationRecord,
} from "../conversation-context.types";
import type { CompactionOptions } from "./compaction";
import type { RollingWindowOptions } from "./rolling-window";

export type { CompactionOptions, SummarizeRecords } from "./compaction";
export type { RollingWindowOptions } from "./rolling-window";

/** Input used when preparing records for an agent call. */
export interface ContextPrepareInput {
  readonly agentName: string;
  readonly model?: string;
  readonly contextUsage?: ContextUsage;
  readonly contextWindow?: number;
  readonly maxInputTokens?: number;
}

/** Input handed to a custom record transform. */
export interface ContextTransformInput extends ContextPrepareInput {
  readonly records: readonly ConversationRecord[];
}

/** Custom record transform used for behavior beyond built-in retention. */
export type ContextRecordTransform = (
  input: ContextTransformInput,
) => readonly ConversationRecord[] | Promise<readonly ConversationRecord[]>;

/** Metadata explaining why retention ran for an agent context. */
export interface ConversationRetentionTrigger {
  /** Provider/model identifier involved in the retention decision. */
  readonly model?: string;
  /** Final-step context usage from the previous model call. */
  readonly contextUsage?: ContextUsage;
  /** Token limit used for the threshold comparison. */
  readonly tokenLimit?: number;
  /** Provider context window, when known. */
  readonly contextWindow?: number;
  /** Provider max input tokens, when known. */
  readonly maxInputTokens?: number;
  /** Observed `contextUsage.totalTokens / tokenLimit`, when token metadata is known. */
  readonly ratio?: number;
  /** Ratio threshold that triggers default compaction. */
  readonly thresholdRatio?: number;
  /** Active record count that triggered explicit count-based compaction. */
  readonly activeRecordCount?: number;
  /** Configured active-record threshold for explicit count-based compaction. */
  readonly recordThreshold?: number;
}

/** Event emitted when retention changes an agent's effective context. */
export interface ConversationRetentionEvent {
  /** Stable identifier for this retention event. */
  readonly id: string;
  /** Agent whose context was changed. */
  readonly agentName: string;
  /** ISO timestamp for when retention ran. */
  readonly createdAt: string;
  /** Retention operation that ran. */
  readonly kind: "compaction";
  /** Why the operation was triggered. */
  readonly reason: "context-window" | "record-count";
  /** Trigger metadata used to decide whether retention should run. */
  readonly trigger: ConversationRetentionTrigger;
  /** Number of active records compacted into the summary. */
  readonly recordsCompacted: number;
  /** Number of recent active records retained verbatim. */
  readonly recordsRetained: number;
  /** Synthetic summary record inserted into the active context. */
  readonly summaryRecord: ConversationRecord;
  /** Ids of records tombstoned by this retention event. */
  readonly supersededRecordIds: readonly string[];
  /** Existing active record before which the summary was inserted. */
  readonly insertBeforeRecordId?: string;
}

/** Result of applying configured context retention. */
export interface ContextRetentionResult {
  /** Updated full record list, including tombstoned records. */
  readonly records: readonly ConversationRecord[];
  /** Retention events emitted while preparing the context. */
  readonly events: readonly ConversationRetentionEvent[];
}

/** Retention and compaction options for a conversation context. */
export interface ContextRetentionOptions {
  /**
   * Keep only the most recent active records visible to the model. A number is
   * shorthand for `{ maxRecords: number }`.
   */
  readonly rollingWindow?: number | RollingWindowOptions;
  /**
   * Compact older active records into a summary. `true` enables default
   * thresholds; an object customizes them.
   */
  readonly compaction?: boolean | CompactionOptions;
  /**
   * Optional programmatic extension point that runs after built-in rolling and
   * compaction behavior.
   */
  readonly transformRecords?:
    | ContextRecordTransform
    | readonly ContextRecordTransform[];
}
