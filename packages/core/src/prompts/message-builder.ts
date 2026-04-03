// Message builder — Pure utility for composing AI SDK message arrays.
//
// Combines conversation history with the current user message into
// the format expected by `generateText()` / `streamText()`.
// This is the function that replaces BaseAgent's inline _buildMessages().

import type { ModelMessage } from "ai";
import type { ConversationHistory } from "./history/conversation-history";
import type { PromptTemplate, TemplateVariables } from "./types";

// Types

/**
 * Options for building a message array.
 */
export interface BuildMessagesOptions {
  /** The current user message to append. */
  readonly message: string;

  /**
   * Conversation history to prepend.
   * If not provided, only the current message is included.
   */
  readonly history?: ConversationHistory;

  /**
   * Additional context messages to prepend before history.
   * Useful for injecting few-shot examples or other context.
   */
  readonly prefix?: readonly ModelMessage[];
}

/**
 * Options for resolving a system prompt, supporting both static strings
 * and dynamic prompt templates.
 */
export interface SystemPromptOptions {
  /** A static system prompt string. */
  readonly systemPrompt?: string;

  /**
   * A prompt template for dynamic system prompts.
   * Takes precedence over `systemPrompt` if both are provided.
   */
  readonly systemPromptTemplate?: PromptTemplate;

  /** Override variables for the system prompt template. */
  readonly templateOverrides?: TemplateVariables;
}

// buildMessages

/**
 * Build a message array for the Vercel AI SDK.
 *
 * Composes messages in this order:
 * 1. `prefix` messages (e.g., few-shot examples)
 * 2. Conversation history (from `ConversationHistory`)
 * 3. Current user message
 *
 * Returns native AI SDK `ModelMessage[]` that can be passed directly to
 * `generateText()` / `streamText()`. Preserves tool calls, tool results,
 * reasoning, and multi-modal content from the conversation history.
 *
 * Note: The system prompt is NOT included in the message array — it should
 * be passed via the `system` parameter of `generateText`/`streamText`.
 *
 * @example
 * ```ts
 * const messages = buildMessages({
 *   message: "How do I use generics?",
 *   history,
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

  // 2. Conversation history
  if (options.history && !options.history.isEmpty) {
    const historyMessages = options.history.toMessages();
    for (const historyMessage of historyMessages) {
      messages.push(historyMessage);
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
 * If `systemPromptTemplate` is provided, it takes precedence and is built
 * with the given overrides. Otherwise, the static `systemPrompt` is returned.
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
 * const prompt = await resolveSystemPrompt({
 *   systemPromptTemplate: template,
 *   templateOverrides: { language: "Rust" },
 * });
 * // => "You are a reviewer, an expert in Rust."
 * ```
 */
export async function resolveSystemPrompt(
  options: SystemPromptOptions,
): Promise<string | undefined> {
  if (options.systemPromptTemplate) {
    return options.systemPromptTemplate.render(options.templateOverrides);
  }
  return options.systemPrompt;
}
