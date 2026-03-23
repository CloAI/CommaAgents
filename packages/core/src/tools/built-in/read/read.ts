// read — read file or directory contents as an agent tool

import { readdir, readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { defineTool } from "../../define/define-tool";
import type { ToolDef } from "../../tool.types";

/**
 * Configuration for the read tool.
 */
export interface ReadToolConfig {
  /** Maximum number of lines to return per call (default: 2000). */
  readonly defaultLimit?: number;
  /** Maximum characters per line before truncation (default: 2000). */
  readonly maxLineLength?: number;
}

const DEFAULT_LIMIT = 2000;
const DEFAULT_MAX_LINE_LENGTH = 2000;

const readParams = z.object({
  filePath: z.string().describe("Absolute or relative path to the file or directory to read."),
  offset: z
    .number()
    .optional()
    .describe("Line number to start reading from (1-indexed). Defaults to 1."),
  limit: z.number().optional().describe("Maximum number of lines to return. Defaults to 2000."),
});

/**
 * Create a read tool for reading file and directory contents.
 *
 * Returns file contents with each line prefixed by its line number (e.g., `1: content`).
 * For directories, returns a listing of entries with trailing `/` for subdirectories.
 * Supports pagination via offset and limit parameters.
 *
 * @example
 * ```ts
 * const read = createReadTool();
 * const tools = { read };
 *
 * // With custom limits
 * const read = createReadTool({ defaultLimit: 500, maxLineLength: 1000 });
 * ```
 */
export function createReadTool(config?: ReadToolConfig): ToolDef<typeof readParams> {
  const defaultLimit = config?.defaultLimit ?? DEFAULT_LIMIT;
  const maxLineLength = config?.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;

  return defineTool({
    description:
      "Read a file or directory. For files, returns contents with line numbers (e.g., `1: content`). " +
      "For directories, returns a listing of entries. Use the offset and limit parameters to " +
      "paginate through large files.",
    parameters: readParams,
    execute: async (args, _ctx) => {
      const filePath = args.filePath;
      const offset = Math.max(1, args.offset ?? 1);
      const limit = args.limit ?? defaultLimit;

      let fileStat: Awaited<ReturnType<typeof stat>>;
      try {
        fileStat = await stat(filePath);
      } catch (err) {
        return {
          output: `Error: path not found: ${filePath}`,
          metadata: { error: true, filePath },
        };
      }

      // Directory listing
      if (fileStat.isDirectory()) {
        try {
          const entries = await readdir(filePath, { withFileTypes: true });
          const lines = entries.map((entry) => {
            const suffix = entry.isDirectory() ? "/" : "";
            return `${entry.name}${suffix}`;
          });
          return {
            output: lines.join("\n") || "[Empty directory]",
            metadata: { type: "directory", filePath, entries: lines.length },
          };
        } catch (err) {
          return {
            output: `Error: could not read directory: ${filePath}`,
            metadata: { error: true, filePath },
          };
        }
      }

      // File reading
      try {
        const content = await readFile(filePath, "utf-8");
        const allLines = content.split("\n");
        const totalLines = allLines.length;

        // Apply offset (1-indexed) and limit
        const startIdx = offset - 1;
        const sliced = allLines.slice(startIdx, startIdx + limit);

        const numbered = sliced.map((line, i) => {
          const lineNum = startIdx + i + 1;
          const truncated =
            line.length > maxLineLength ? `${line.slice(0, maxLineLength)}...` : line;
          return `${lineNum}: ${truncated}`;
        });

        let output = numbered.join("\n");

        if (startIdx + limit < totalLines) {
          output += `\n\n(Showing lines ${offset}-${startIdx + limit} of ${totalLines} total. Use offset=${startIdx + limit + 1} to read more.)`;
        } else if (offset === 1) {
          output += `\n\n(End of file - total ${totalLines} lines)`;
        }

        return {
          output,
          metadata: {
            type: "file",
            filePath,
            totalLines,
            offset,
            linesReturned: sliced.length,
          },
        };
      } catch (err) {
        return {
          output: `Error: could not read file: ${filePath}`,
          metadata: { error: true, filePath },
        };
      }
    },
  });
}
