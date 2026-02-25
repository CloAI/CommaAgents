// Prompt system types — message formats, conversation history config, and template types.
//
// These types align with the Vercel AI SDK's message format while providing
// CommaAgents-specific abstractions for conversation management and prompt templating.

// ---------------------------------------------------------------------------
// Chat Messages
// ---------------------------------------------------------------------------

/**
 * A chat message role. Matches the Vercel AI SDK's supported roles.
 * - `"user"` — human/caller message
 * - `"assistant"` — LLM response
 * - `"system"` — system-level instruction (rarely used in message arrays;
 *   prefer the `system` parameter on `generateText`/`streamText`)
 */
export type ChatRole = "user" | "assistant" | "system";

/**
 * A single chat message in the conversation.
 *
 * Intentionally kept simple (string content only). The AI SDK handles
 * multi-part content (images, etc.) at its own layer; CommaAgents passes
 * through string messages between agents in flows.
 */
export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
}

/**
 * A complete conversation turn: user message paired with assistant response.
 * Used internally by `ConversationHistory` for windowing/truncation.
 */
export interface ConversationTurn {
  readonly userMessage: string;
  readonly assistantMessage: string;
}

// ---------------------------------------------------------------------------
// Conversation History Configuration
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Prompt Template Types
// ---------------------------------------------------------------------------

/**
 * A value that can be used to fill a prompt template variable.
 * - `string` — static value
 * - `() => string` — dynamic value resolved at build time
 * - `() => Promise<string>` — async dynamic value (e.g., reading from env/file)
 */
export type TemplateValue = string | (() => string | Promise<string>);

/**
 * A map of variable names to their values for prompt template interpolation.
 *
 * @example
 * ```ts
 * const vars: TemplateVariables = {
 *   role: "code reviewer",
 *   language: "TypeScript",
 *   style: () => loadStyleGuide(), // async
 * };
 * ```
 */
export type TemplateVariables = Readonly<Record<string, TemplateValue>>;

/**
 * Configuration for creating a prompt template.
 */
export interface PromptTemplateConfig {
  /**
   * The template string with `{variable}` placeholders.
   *
   * Supports:
   * - `{name}` — replaced with the value from `variables`
   * - `{env:VAR_NAME}` — replaced with `process.env.VAR_NAME`
   * - `{file:/path/to/file}` — replaced with file contents (via `resolveInterpolation`)
   *
   * @example
   * ```ts
   * "You are {role}, an expert in {language}. API key: {env:MY_API_KEY}"
   * ```
   */
  readonly template: string;

  /**
   * Default variable values. Can be overridden at build time.
   */
  readonly variables?: TemplateVariables;
}

/**
 * A compiled prompt template that can be built with variable substitution.
 */
export interface PromptTemplate {
  /** The original template string. */
  readonly template: string;

  /** The default variables provided at creation time. */
  readonly defaults: TemplateVariables;

  /**
   * Build the prompt by resolving all variables.
   * Override variables take precedence over defaults.
   *
   * @throws {Error} if a variable in the template has no value
   */
  build(overrides?: TemplateVariables): Promise<string>;
}
