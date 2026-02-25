// PromptTemplate — Variable interpolation for system prompts and message templates.
//
// Supports three kinds of placeholders:
// - {name}       — resolved from the variables map
// - {env:VAR}    — resolved from process.env
// - {file:/path} — resolved from file contents (first line, trimmed)
//
// This is a factory function (not a class) because prompt templates are
// stateless — they just hold a template string and default variables.

import type {
  PromptTemplate,
  PromptTemplateConfig,
  TemplateValue,
  TemplateVariables,
} from "../types";

// ---------------------------------------------------------------------------
// Placeholder regex
// ---------------------------------------------------------------------------

/**
 * Matches all `{...}` placeholders in a template string.
 * Captures the content between braces (non-greedy).
 *
 * Matches:
 * - `{name}`       — variable reference
 * - `{env:VAR}`    — environment variable
 * - `{file:/path}` — file contents
 *
 * Does NOT match:
 * - `{{escaped}}` — double braces are treated as literal braces
 */
const PLACEHOLDER_RE = /\{([^{}]+)\}/g;

/**
 * Matches the `{env:VAR_NAME}` pattern.
 * Captures the variable name after `env:`.
 */
const ENV_RE = /^env:(.+)$/;

/**
 * Matches the `{file:/path/to/file}` pattern.
 * Captures the file path after `file:`.
 */
const FILE_RE = /^file:(.+)$/;

// ---------------------------------------------------------------------------
// Resolve a single placeholder
// ---------------------------------------------------------------------------

/**
 * Resolve a single placeholder value.
 *
 * Resolution order:
 * 1. Check override variables
 * 2. Check default variables
 * 3. Check for `env:` prefix → process.env
 * 4. Check for `file:` prefix → file contents
 * 5. Throw if unresolved
 */
async function resolvePlaceholder(
  key: string,
  overrides: TemplateVariables | undefined,
  defaults: TemplateVariables,
): Promise<string> {
  // Check override variables first
  if (overrides && key in overrides) {
    return resolveValue(overrides[key]!);
  }

  // Check default variables
  if (key in defaults) {
    return resolveValue(defaults[key]!);
  }

  // Check for env: prefix
  const envMatch = key.match(ENV_RE);
  if (envMatch) {
    const varName = envMatch[1]!;
    const value = process.env[varName];
    if (value !== undefined) {
      return value;
    }
    throw new Error(
      `Prompt template variable "{env:${varName}}": environment variable "${varName}" is not set`,
    );
  }

  // Check for file: prefix
  const fileMatch = key.match(FILE_RE);
  if (fileMatch) {
    const filePath = fileMatch[1]!;
    try {
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(filePath, "utf-8");
      const firstLine = content.split("\n")[0];
      return firstLine?.trim() ?? "";
    } catch (err) {
      throw new Error(
        `Prompt template variable "{file:${filePath}}": ${err instanceof Error ? err.message : "file not readable"}`,
      );
    }
  }

  // Unresolved
  throw new Error(
    `Prompt template variable "{${key}}" has no value. ` +
      "Provide it in the variables map or as an override.",
  );
}

/**
 * Resolve a `TemplateValue` (string, sync function, or async function) to a string.
 */
async function resolveValue(value: TemplateValue): Promise<string> {
  if (typeof value === "string") {
    return value;
  }
  return await value();
}

// ---------------------------------------------------------------------------
// Build template
// ---------------------------------------------------------------------------

/**
 * Process a template string, resolving all placeholders.
 * Handles `{{escaped}}` double-brace literals.
 */
async function buildTemplate(
  template: string,
  overrides: TemplateVariables | undefined,
  defaults: TemplateVariables,
): Promise<string> {
  // First, replace escaped double-braces with a sentinel
  const SENTINEL = "\0BRACE\0";
  const escaped = template.replace(/\{\{/g, SENTINEL + "L").replace(/\}\}/g, SENTINEL + "R");

  // Collect all placeholder matches and resolve them
  const matches: Array<{ full: string; key: string }> = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  const re = new RegExp(PLACEHOLDER_RE.source, PLACEHOLDER_RE.flags);
  match = re.exec(escaped);
  while (match !== null) {
    matches.push({ full: match[0], key: match[1]! });
    match = re.exec(escaped);
  }

  // Resolve all placeholders (could be async, so gather promises)
  let result = escaped;
  for (const { full, key } of matches) {
    const resolved = await resolvePlaceholder(key, overrides, defaults);
    result = result.replace(full, resolved);
  }

  // Restore escaped braces
  return result
    .replace(new RegExp(`${SENTINEL.replace(/\0/g, "\\0")}L`, "g"), "{")
    .replace(new RegExp(`${SENTINEL.replace(/\0/g, "\\0")}R`, "g"), "}");
}

// ---------------------------------------------------------------------------
// createPromptTemplate
// ---------------------------------------------------------------------------

/**
 * Create a prompt template with variable interpolation.
 *
 * @example
 * ```ts
 * const template = createPromptTemplate({
 *   template: "You are {role}, an expert in {language}.",
 *   variables: { role: "a code reviewer", language: "TypeScript" },
 * });
 *
 * const prompt = await template.build();
 * // => "You are a code reviewer, an expert in TypeScript."
 *
 * // Override at build time:
 * const prompt2 = await template.build({ language: "Rust" });
 * // => "You are a code reviewer, an expert in Rust."
 * ```
 *
 * @example
 * ```ts
 * // Dynamic values and env variables
 * const template = createPromptTemplate({
 *   template: "API key: {env:MY_KEY}. Today is {date}.",
 *   variables: { date: () => new Date().toISOString().split("T")[0]! },
 * });
 * ```
 *
 * @example
 * ```ts
 * // Escaped braces (literal { and } in output)
 * const template = createPromptTemplate({
 *   template: "Output JSON like {{\"key\": \"value\"}}",
 * });
 * const prompt = await template.build();
 * // => 'Output JSON like {"key": "value"}'
 * ```
 */
export function createPromptTemplate(config: PromptTemplateConfig): PromptTemplate {
  const defaults: TemplateVariables = config.variables ?? {};

  return {
    template: config.template,
    defaults,
    build: (overrides?: TemplateVariables) => buildTemplate(config.template, overrides, defaults),
  };
}

/**
 * Extract all variable names referenced in a template string.
 * Useful for validation or documentation.
 *
 * @example
 * ```ts
 * extractVariables("Hello {name}, you are {role}.")
 * // => ["name", "role"]
 *
 * extractVariables("Key: {env:API_KEY}, file: {file:/tmp/x}")
 * // => ["env:API_KEY", "file:/tmp/x"]
 * ```
 */
export function extractVariables(template: string): readonly string[] {
  const vars: string[] = [];
  const re = new RegExp(PLACEHOLDER_RE.source, PLACEHOLDER_RE.flags);
  let match = re.exec(template);
  while (match !== null) {
    vars.push(match[1]!);
    match = re.exec(template);
  }
  return vars;
}
