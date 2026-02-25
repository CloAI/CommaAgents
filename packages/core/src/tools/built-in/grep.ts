// grep — content search as an agent tool

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { defineTool } from "../define/define-tool";
import type { ToolDef } from "../tool";

/**
 * Configuration for the grep tool.
 */
export interface GrepToolConfig {
  /** Maximum number of matching files to return (default: 100). */
  readonly maxResults?: number;
  /** Maximum file size in bytes to search (default: 1MB). */
  readonly maxFileSize?: number;
}

const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_MAX_FILE_SIZE = 1_048_576; // 1MB

const grepParams = z.object({
  pattern: z.string().describe("Regular expression pattern to search for in file contents."),
  path: z
    .string()
    .optional()
    .describe("Directory to search in. Defaults to the current working directory."),
  include: z
    .string()
    .optional()
    .describe('File pattern to filter which files are searched (e.g., "*.ts", "*.{ts,tsx}").'),
});

/**
 * Recursively collect file paths from a directory.
 */
async function collectFiles(
  dir: string,
  includeGlob: Bun.Glob | null,
  maxFileSize: number,
): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      // Skip hidden directories and common noise
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        // Apply include filter
        if (includeGlob && !includeGlob.match(entry.name)) continue;

        try {
          const fileStat = await stat(fullPath);
          if (fileStat.size <= maxFileSize) {
            files.push(fullPath);
          }
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }

  await walk(dir);
  return files;
}

/**
 * Create a grep tool for searching file contents by regex.
 *
 * Recursively searches files in the given directory (or cwd) for lines
 * matching the regex pattern. Returns file paths with matching line numbers
 * and content.
 *
 * @example
 * ```ts
 * const grep = createGrepTool();
 * const tools = { grep };
 *
 * // With custom limits
 * const grep = createGrepTool({ maxResults: 50, maxFileSize: 512_000 });
 * ```
 */
export function createGrepTool(config?: GrepToolConfig): ToolDef<typeof grepParams> {
  const maxResults = config?.maxResults ?? DEFAULT_MAX_RESULTS;
  const maxFileSize = config?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

  return defineTool({
    description:
      "Search file contents using a regular expression. Returns matching file paths " +
      "with line numbers and content. Supports regex syntax and optional file pattern filtering. " +
      `Results are capped at ${maxResults} matching files.`,
    parameters: grepParams,
    execute: async (args, _ctx) => {
      const { pattern, include } = args;
      const cwd = args.path ?? process.cwd();

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "g");
      } catch (err) {
        return {
          output: `Error: invalid regex pattern "${pattern}": ${err instanceof Error ? err.message : String(err)}`,
          metadata: { error: true, pattern },
        };
      }

      const includeGlob = include ? new Bun.Glob(include) : null;

      let files: string[];
      try {
        files = await collectFiles(cwd, includeGlob, maxFileSize);
      } catch (err) {
        return {
          output: `Error: could not read directory: ${cwd}`,
          metadata: { error: true, cwd },
        };
      }

      const results: string[] = [];
      let matchingFileCount = 0;

      for (const filePath of files) {
        if (matchingFileCount >= maxResults) break;

        let content: string;
        try {
          content = await readFile(filePath, "utf-8");
        } catch {
          continue;
        }

        const lines = content.split("\n");
        const matchingLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          // Reset regex state for each line
          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            matchingLines.push(`  ${i + 1}: ${lines[i]}`);
          }
        }

        if (matchingLines.length > 0) {
          matchingFileCount++;
          const relPath = relative(cwd, filePath) || filePath;
          results.push(`${relPath}\n${matchingLines.join("\n")}`);
        }
      }

      if (results.length === 0) {
        return {
          output: `No matches found for pattern "${pattern}" in ${cwd}`,
          metadata: { pattern, cwd, matchCount: 0 },
        };
      }

      let output = results.join("\n\n");
      if (matchingFileCount >= maxResults) {
        output += `\n\n(Results capped at ${maxResults} files. Narrow your pattern or use include filter.)`;
      }

      return {
        output,
        metadata: { pattern, cwd, matchingFiles: matchingFileCount },
      };
    },
  });
}
