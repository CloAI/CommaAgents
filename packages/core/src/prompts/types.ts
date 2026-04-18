// Prompt system types — template formats and configuration.
//
// These types define the prompt template system backed by LiquidJS.
// Conversation context types (turns, messages, strategies) live in
// the context module at ../context/conversation-context.types.ts.

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
