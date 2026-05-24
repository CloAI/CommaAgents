// Build tool system prompt — Collects system prompt contributions from tools.
//
// Tools can optionally contribute to the agent's system prompt via the
// `systemPrompt` field in their definition. This utility collects all
// contributions and merges them into a single string that gets injected
// ONCE into the agent's system prompt at creation time (not per-call).
//
// Each tool's contribution is prefixed with `## tool-name` for clarity.

import type { ToolContext, ToolDefinition } from "./tool.types";

/**
 * Options for building tool system prompt contributions.
 */
interface BuildToolSystemPromptOptions {
  /** The tool definitions to collect system prompts from. */
  readonly toolDefinitions: Readonly<Record<string, ToolDefinition>>;
  /** ToolContext passed to dynamic systemPrompt functions. */
  readonly toolContext: ToolContext;
}

/**
 * Collect and merge system prompt contributions from all tools.
 *
 * Tools can contribute via:
 * - Static string: `systemPrompt: "Always use JSON format."`
 * - Dynamic function: `systemPrompt: async (ctx) => \`CWD: ${ctx.guard.cwd}\``
 *
 * The contributions are merged into a single string, with each tool's
 * contribution prefixed by `## tool-name` for clarity. Only tools with
 * a `systemPrompt` field are included.
 *
 * @returns Merged system prompt string, or undefined if no tools have contributions.
 *
 * @example
 * ```ts
 * const toolDefs = { read_file: { systemPrompt: "..." }, ... };
 * const prompt = await buildToolSystemPrompt({ toolDefs, toolContext });
 * // => "## read_file\n..." or undefined
 * ```
 */
export async function buildToolSystemPrompt(
  options: BuildToolSystemPromptOptions,
): Promise<string | undefined> {
  const { toolDefinitions, toolContext } = options;

  const contributions: string[] = [];

  for (const [name, definition] of Object.entries(toolDefinitions)) {
    if (!definition.systemPrompt) continue;

    let contribution: string;
    if (typeof definition.systemPrompt === "function") {
      const result = definition.systemPrompt(toolContext);
      contribution = result instanceof Promise ? await result : result;
    } else {
      contribution = definition.systemPrompt;
    }

    if (contribution.trim().length > 0) {
      contributions.push(`## ${name}\n${contribution}`);
    }
  }

  if (contributions.length === 0) return undefined;

  return contributions.join("\n\n");
}

/**
 * Merge multiple system prompt strings into one.
 *
 * Handles undefined values and ensures proper separation between sections.
 * The order of the input array is preserved.
 *
 * @returns Merged string, or undefined if all inputs are undefined/empty.
 */
export function mergeSystemPrompts(
  prompts: readonly (string | undefined)[],
): string | undefined {
  const defined = prompts.filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  if (defined.length === 0) return undefined;
  return defined.join("\n\n");
}
