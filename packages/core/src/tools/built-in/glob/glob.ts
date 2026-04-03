// glob — file pattern matching as an agent tool

import { z } from "zod";
import { defineTool } from "../../define/define-tool";
import type { ToolDefinition } from "../../tool.types";

/**
 * Configuration for the glob tool.
 */
export interface GlobToolConfig {
  /** Maximum number of results to return (default: 100). */
  readonly maxResults?: number;
}

const DEFAULT_MAX_RESULTS = 100;

const globParams = z.object({
  pattern: z
    .string()
    .describe('Glob pattern to match files against (e.g., "**/*.ts", "src/**/*.test.ts").'),
  path: z
    .string()
    .optional()
    .describe("Directory to search in. Defaults to the current working directory."),
});

/**
 * Create a glob tool for finding files by pattern.
 *
 * Uses Bun's native `Bun.Glob` for fast file matching.
 * Returns matching file paths, capped at a configurable maximum.
 *
 * @example
 * ```ts
 * const glob = createGlobTool();
 * const tools = { glob };
 *
 * // With custom result limit
 * const glob = createGlobTool({ maxResults: 50 });
 * ```
 */
export function createGlobTool(config?: GlobToolConfig): ToolDefinition<typeof globParams> {
  const maxResults = config?.maxResults ?? DEFAULT_MAX_RESULTS;

  return defineTool({
    description:
      "Find files matching a glob pattern. Returns matching file paths sorted alphabetically. " +
      'Supports patterns like "**/*.ts" or "src/**/*.test.ts". ' +
      `Results are capped at ${maxResults} entries.`,
    parameters: globParams,
    execute: async (validatedArguments, _toolContext) => {
      const { pattern, path: searchPath } = validatedArguments;
      const cwd = searchPath ?? process.cwd();

      try {
        const glob = new Bun.Glob(pattern);
        const matches: string[] = [];

        for await (const entry of glob.scan({ cwd, onlyFiles: true })) {
          matches.push(entry);
          if (matches.length >= maxResults) break;
        }

        matches.sort();

        if (matches.length === 0) {
          return {
            output: `No files found matching pattern "${pattern}" in ${cwd}`,
            metadata: { pattern, cwd, matchCount: 0 },
          };
        }

        let output = matches.join("\n");
        if (matches.length >= maxResults) {
          output += `\n\n(Results capped at ${maxResults}. Narrow your pattern for more specific results.)`;
        }

        return {
          output,
          metadata: { pattern, cwd, matchCount: matches.length },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          output: `Error: glob failed for pattern "${pattern}": ${message}`,
          metadata: { error: true, pattern, cwd },
        };
      }
    },
  });
}
