import type { z } from "zod/v4";
import type {
  ChildRunEntrySchema,
  RunContentSchema,
  RunHistoryEntrySchema,
  RunMessageSchema,
} from "./messages.schemas";

/** Ordered text, reasoning, or tool content within a displayed message. */
export type RunContent = z.infer<typeof RunContentSchema>;
/** One agent invocation or user message with stable identity across streaming and history. */
export type RunMessage = z.infer<typeof RunMessageSchema>;
/** Parent-owned reference to a separately observable child conversation. */
export type ChildRunEntry = z.infer<typeof ChildRunEntrySchema>;
/** Display history excludes execution transitions and descendant conversation contents. */
export type RunHistoryEntry = z.infer<typeof RunHistoryEntrySchema>;
/** @internal In-progress invocation and the positions of its reasoning/tool blocks. */
export interface ActiveRunMessage {
  message: RunMessage;
  readonly reasoning: Map<string, number>;
  readonly tools: Map<string, number>;
}
