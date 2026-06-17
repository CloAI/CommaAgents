// Prompt override types — layered, non-destructive edits to a strategy's
// LLM-agent prompts. Overrides are applied to an in-memory copy of the raw
// strategy; the base strategy file on disk is never mutated.

/**
 * A value that can be assigned to a system-prompt template variable.
 * Mirrors the value union accepted by the core strategy schema's
 * `systemPromptTemplate.variables`.
 */
export type TemplateVariableValue =
  | string
  | number
  | boolean
  | readonly string[]
  | Readonly<Record<string, string>>;

/**
 * A single layered edit targeting one LLM agent's prompt.
 *
 * Exactly how the edit is applied depends on which fields are set:
 * - `systemPrompt` replaces the agent's system prompt outright.
 * - `appendToSystemPrompt` appends a block to the existing system prompt.
 * - `templateVariables` merges into the agent's `systemPromptTemplate.variables`.
 *
 * Multiple fields may be combined; they are applied in the order above.
 */
export interface PromptOverride {
  /** Name of the LLM agent (key in `strategy.agents`) to edit. */
  readonly agentName: string;
  /** Replace the agent's system prompt with this text. */
  readonly systemPrompt?: string;
  /** Append this block to the agent's existing system prompt. */
  readonly appendToSystemPrompt?: string;
  /** Merge these variables into the agent's prompt template variables. */
  readonly templateVariables?: Readonly<Record<string, TemplateVariableValue>>;
}
