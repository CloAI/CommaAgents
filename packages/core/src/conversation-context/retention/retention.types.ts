import type { ConversationRecord } from "../conversation-context.types";
import type { CompactionOptions } from "./compaction";
import type { RollingWindowOptions } from "./rolling-window";

export type { CompactionOptions, SummarizeRecords } from "./compaction";
export type { RollingWindowOptions } from "./rolling-window";

/** Input used when preparing records for an agent call. */
export interface ContextPrepareInput {
  readonly agentName: string;
}

/** Input handed to a custom record transform. */
export interface ContextTransformInput extends ContextPrepareInput {
  readonly records: readonly ConversationRecord[];
}

/** Custom record transform used for behavior beyond built-in retention. */
export type ContextRecordTransform = (
  input: ContextTransformInput,
) => readonly ConversationRecord[] | Promise<readonly ConversationRecord[]>;

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
