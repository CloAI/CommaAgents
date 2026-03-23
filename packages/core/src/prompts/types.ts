// Prompt system types — message formats, conversation history config, and template types.
//
// These types align with the Vercel AI SDK's message format. ConversationTurn
// stores native AI SDK ModelMessage objects to preserve tool calls, reasoning,
// multi-modal content, and proper multi-turn context.

import type { AssistantModelMessage, ToolModelMessage, UserModelMessage } from "ai";

// Re-export AI SDK message types for consumer convenience
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

// Conversation History Configuration

/**
 * Strategy for truncating conversation history when it grows too large.
 *
 * - `"sliding-window"` — keep the most recent N turns, discard oldest
 * - `"none"` — keep all history (unbounded; use with caution)
 */
export type TruncationStrategy = "sliding-window" | "none";

/**
 * Configuration for `ConversationHistory` behavior.
 */
export interface ConversationHistoryConfig {
  /**
   * Maximum number of conversation turns to retain.
   * Only applies when `truncation` is `"sliding-window"`.
   * @default Infinity (unbounded when using "none" strategy)
   */
  readonly maxTurns?: number;

  /**
   * How to handle history that exceeds `maxTurns`.
   * @default "sliding-window" (if maxTurns is set), "none" (otherwise)
   */
  readonly truncation?: TruncationStrategy;

  /**
   * Estimated average tokens per character, used for rough token counting.
   * Different models tokenize differently; this is an approximation.
   * @default 0.25 (roughly 4 characters per token for English text)
   */
  readonly tokensPerChar?: number;

  /**
   * Optional maximum estimated token count for the history.
   * When exceeded, oldest turns are dropped (regardless of `maxTurns`).
   * This is an approximation — actual token counts depend on the model's tokenizer.
   */
  readonly maxTokens?: number;
}

// Prompt Template Types (LiquidJS-backed)

/**
 * A value that can be used to fill a prompt template variable.
 *
 * - Primitives (`string`, `number`, `boolean`, `null`) are passed directly to Liquid.
 * - Arrays and objects enable `{% for %}` loops and dot-access in templates.
 * - Functions (`() => string | Promise<string>`) are resolved to strings before
 *   the Liquid render pass — this preserves the async-first design.
 */
export type TemplateValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly TemplateValue[]
  | { readonly [key: string]: TemplateValue }
  | (() => string | Promise<string>);

/**
 * A map of variable names to their values for prompt template interpolation.
 *
 * Values can be primitives, arrays, objects, or async functions.
 * Functions are resolved to strings before the Liquid render pass.
 *
 * @example
 * ```ts
 * const vars: TemplateVariables = {
 *   role: "code reviewer",
 *   language: "TypeScript",
 *   tools: ["bash", "read", "write"],
 *   style: () => loadStyleGuide(), // async function → resolved to string
 * };
 * ```
 */
export type TemplateVariables = Readonly<Record<string, TemplateValue>>;

/**
 * Configuration for creating a prompt template.
 */
export interface PromptTemplateConfig {
  /**
   * The template string using Liquid syntax.
   *
   * Supports the full LiquidJS template language:
   * - `{{ name }}` — variable interpolation
   * - `{{ "VAR" | env }}` — environment variable via custom filter
   * - `{{ "/path" | file }}` — file contents (first line) via custom filter
   * - `{{ "command" | exec }}` — shell command output via custom filter
   * - `{% if condition %}...{% endif %}` — conditionals
   * - `{% for item in items %}...{% endfor %}` — loops
   * - `{{ text | upcase }}` — built-in Liquid filters
   *
   * @example
   * ```ts
   * "You are {{ role }}, an expert in {{ language }}."
   * ```
   */
  readonly template: string;

  /**
   * Default variable values. Can be overridden at render time.
   */
  readonly variables?: TemplateVariables;
}

/**
 * A compiled prompt template backed by LiquidJS.
 */
export interface PromptTemplate {
  /** The original template string. */
  readonly template: string;

  /** The default variables provided at creation time. */
  readonly defaults: TemplateVariables;

  /**
   * Render the prompt by resolving all variables through LiquidJS.
   * Override variables take precedence over defaults.
   *
   * @throws {Error} if a required variable is missing or a filter fails
   */
  render(overrides?: TemplateVariables): Promise<string>;
}
