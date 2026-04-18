// Message builder — Pure utility for composing AI SDK message arrays.
//
// Combines conversation context with the current user message into
// the format expected by `generateText()` / `streamText()`.

import type { ModelMessage } from "ai";
import type { ConversationContext } from "../context/conversation-context";
import type { PromptTemplate } from "./types";

// Types

/**
 * Options for building a message array.
 */
export interface BuildMessagesOptions {
  /** The current user message to append. */
  readonly message: string;

  /**
   * Conversation context to prepend.
   * If not provided, only the current message is included.
   */
  readonly context?: ConversationContext;

  /**
   * Additional context messages to prepend before conversation context.
   * Useful for injecting few-shot examples or other context.
   */
  readonly prefix?: readonly ModelMessage[];
}

/**
 * Options for resolving a system prompt, supporting both static strings
 * and dynamic prompt templates.
 */
export interface SystemPromptOptions {
  /**
   * System prompt — a static string or a `PromptTemplate` for dynamic interpolation.
   * When a `PromptTemplate` is provided, it is rendered with its baked-in variables.
   */
  readonly systemPrompt?: string | PromptTemplate;
}

// buildMessages

/**
 * Build a message array for the Vercel AI SDK.
 *
 * Composes messages in this order:
 * 1. `prefix` messages (e.g., few-shot examples)
 * 2. Conversation context (from `ConversationContext`)
 * 3. Current user message
 *
 * Returns native AI SDK `ModelMessage[]` that can be passed directly to
 * `generateText()` / `streamText()`. Preserves tool calls, tool results,
 * reasoning, and multi-modal content from the conversation context.
 *
 * Note: The system prompt is NOT included in the message array — it should
 * be passed via the `system` parameter of `generateText`/`streamText`.
 *
 * @example
 * ```ts
 * const messages = buildMessages({
 *   message: "How do I use generics?",
 *   context,
 *   prefix: [
 *     { role: "user", content: "What is TypeScript?" },
 *     { role: "assistant", content: "TypeScript is a typed superset of JavaScript." },
 *   ],
 * });
 *
 * const result = await generateText({
 *   model: openai("gpt-4o"),
 *   system: "You are a helpful assistant.",
 *   messages,
 * });
 * ```
 */
export function buildMessages(options: BuildMessagesOptions): readonly ModelMessage[] {
  const messages: ModelMessage[] = [];

  // 1. Prefix messages
  if (options.prefix) {
    for (const prefixMessage of options.prefix) {
      messages.push(prefixMessage);
    }
  }

  // 2. Conversation context
  if (options.context && !options.context.isEmpty) {
    const contextMessages = options.context.allMessages();
    for (const contextMessage of contextMessages) {
      messages.push(contextMessage);
    }
  }

  // 3. Current user message
  messages.push({ role: "user", content: options.message });

  return messages;
}

// resolveSystemPrompt

/**
 * Resolve a system prompt from either a static string or a dynamic template.
 *
 * If `systemPrompt` is a `PromptTemplate`, it is rendered with its baked-in
 * variables. If it is a plain string, it is returned as-is.
 *
 * @returns The resolved system prompt string, or `undefined` if none configured.
 *
 * @example
 * ```ts
 * // Static
 * const prompt = await resolveSystemPrompt({ systemPrompt: "You are helpful." });
 * // => "You are helpful."
 *
 * // Dynamic template
 * const template = createPromptTemplate({
 *   template: "You are {{ role }}, an expert in {{ language }}.",
 *   variables: { role: "a reviewer", language: "TypeScript" },
 * });
 * const prompt = await resolveSystemPrompt({ systemPrompt: template });
 * // => "You are a reviewer, an expert in TypeScript."
 * ```
 */
export async function resolveSystemPrompt(
  options: SystemPromptOptions,
): Promise<string | undefined> {
  if (!options.systemPrompt) {
    return undefined;
  }

  if (typeof options.systemPrompt === "string") {
    return options.systemPrompt;
  }

  // PromptTemplate — render with baked-in variables (no overrides)
  return options.systemPrompt.render();
}
