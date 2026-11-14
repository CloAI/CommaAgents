import type { z } from "zod/v4";
import type {
  RunContentSchema,
  RunMessageSchema,
  ChildRunEntrySchema,
  RunHistoryEntrySchema,
  StreamingAgentMessageSchema,
  UserMessageSchema,
  CompletedAgentMessageSchema,
  StoppedAgentMessageSchema,
  FailedAgentMessageSchema,
  RunningToolContentSchema,
  CompletedToolContentSchema,
  FailedToolContentSchema,
  StoppedToolContentSchema,
} from "./messages.schemas";
/** Ordered text, reasoning, and tools. */
export type RunContent = z.infer<typeof RunContentSchema>;
/** Final user or agent content included in display history. */
export type RunMessage = z.infer<typeof RunMessageSchema>;
/** Accepted human text. */
export type UserMessage = z.infer<typeof UserMessageSchema>;
/** A successful finalized agent invocation. */
export type CompletedAgentMessage = z.infer<typeof CompletedAgentMessageSchema>;
/** Partial output finalized by an explicit stop. */
export type StoppedAgentMessage = z.infer<typeof StoppedAgentMessageSchema>;
/** Partial output finalized by a failure. */
export type FailedAgentMessage = z.infer<typeof FailedAgentMessageSchema>;
/** Client-visible invocation that is still accumulating content. */
export type StreamingAgentMessage = z.infer<typeof StreamingAgentMessageSchema>;
/** Tool arguments before a result exists. */
export type RunningToolContent = z.infer<typeof RunningToolContentSchema>;
/** Tool result with an explicit output value. */
export type CompletedToolContent = z.infer<typeof CompletedToolContentSchema>;
/** Tool failure content, also retained in the model conversation. */
export type FailedToolContent = z.infer<typeof FailedToolContentSchema>;
/** Tool invocation interrupted without a result. */
export type StoppedToolContent = z.infer<typeof StoppedToolContentSchema>;
/** Parent-owned reference to an independent child run. */
export type ChildRunEntry = z.infer<typeof ChildRunEntrySchema>;
/** Finished display messages and child references. */
export type RunHistoryEntry = z.infer<typeof RunHistoryEntrySchema>;
/** @internal Accumulation is memory-only; history receives final content once. */
export interface ActiveRunMessage {
  message: StreamingAgentMessage;
  readonly reasoning: Map<string, number>;
  readonly tools: Map<string, number>;
}
