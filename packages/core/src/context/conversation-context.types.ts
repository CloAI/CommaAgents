// Conversation context types — turn formats, strategy, and configuration.
//
// These types describe the structure of an ongoing conversation between
// a user and an AI agent. ConversationTurn stores native AI SDK
// ModelMessage objects to preserve tool calls, reasoning, multi-modal
// content, and proper multi-turn context.

import type { AssistantModelMessage, ToolModelMessage, UserModelMessage } from "ai";

// Re-export AI SDK message types for consumer convenience.
// These are the building blocks of conversation turns.
export type { AssistantModelMessage, ModelMessage, ToolModelMessage, UserModelMessage } from "ai";

/**
 * A message generated during an AI SDK call — either an assistant message
 * (possibly containing tool call parts) or a tool message (with tool results).
 *
 * This is the type returned by `result.response.messages` from the AI SDK's
 * `generateText()` / `streamText()`. The AI SDK defines this internally but
 * does not export it, so we define it here.
 */
export type ResponseMessage = AssistantModelMessage | ToolModelMessage;

// Conversation Turn

/**
 * A complete conversation turn: user message paired with the model's response.
 *
 * Stores native AI SDK message types to preserve tool calls, tool results,
 * reasoning, multi-modal content, and proper multi-turn context.
 *
 * - `userMessage` is the user's input as a `UserModelMessage`
 * - `responseMessages` is the full response chain from the AI SDK, which
 *   includes `AssistantModelMessage` (possibly with tool call parts) and
 *   `ToolModelMessage` (tool results). This is exactly what the AI SDK
 *   returns via `result.response.messages`.
 */
export interface ConversationTurn {
  readonly userMessage: UserModelMessage;
  readonly responseMessages: readonly ResponseMessage[];
}

// Context Strategy

/**
 * Strategy for managing conversation context when it grows too large.
 *
 * - `"sliding-window"` — keep the most recent N turns, discard oldest
 * - `"none"` — keep all context (unbounded; use with caution)
 *
 * Future strategies (e.g., `"compaction"`, `"summarization"`) will be
 * added to this union as the system evolves.
 */
export type ContextStrategy = "sliding-window" | "none";

// Context Configuration

/**
 * Configuration for `ConversationContext` behavior.
 */
export interface ConversationContextConfig {
  /**
   * Maximum number of conversation turns to retain.
   * Only applies when `strategy` is `"sliding-window"`.
   * @default Infinity (unbounded when using "none" strategy)
   */
  readonly maxTurns?: number;

  /**
   * How to handle context that exceeds limits.
   * @default "sliding-window" (if maxTurns or maxTokens is set), "none" (otherwise)
   */
  readonly strategy?: ContextStrategy;

  /**
   * Estimated average tokens per character, used for rough token counting.
   * Different models tokenize differently; this is an approximation.
   * @default 0.25 (roughly 4 characters per token for English text)
   */
  readonly tokensPerChar?: number;

  /**
   * Optional maximum estimated token count for the context.
   * When exceeded, oldest turns are dropped (regardless of `maxTurns`).
   * This is an approximation — actual token counts depend on the model's tokenizer.
   */
  readonly maxTokens?: number;
}
