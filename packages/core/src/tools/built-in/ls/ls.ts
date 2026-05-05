// ls — list directory entries, optionally recursive, with size and mtime metadata

import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defineTool } from "../../define/define-tool";
import type { ToolDefinition } from "../../tool.types";

/**
 * Configuration for the ls tool.
 */
export interface LsToolConfig {
  /**
   * Default maximum recursion depth when `recursive` is requested without
   * an explicit `maxDepth` (default: 5). Each level of nesting counts as
   * one unit of depth; the root directory is depth 0.
   */
  readonly defaultMaxDepth?: number;
  /**
   * Hard cap on entries returned per call so a stray `recursive: true` on
   * a large tree can't blow up the agent's context (default: 1000).
   */
  readonly maxEntries?: number;
}

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_ENTRIES = 1000;
const INDENT_PER_DEPTH = "  ";

/**
 * Names that should be skipped when `showHidden` is false.
 *
 * Anything starting with `.` is treated as hidden (Unix convention). This
 * also excludes `.git`, `.DS_Store`, etc. — the exact entries an agent
 * almost never needs to see when exploring a project.
 */
const HIDDEN_PREFIX = ".";

const lsParams = z.object({
  path: z
    .string()
    .describe("Absolute or relative path to the directory to list."),
  recursive: z
    .boolean()
    .optional()
    .describe(
      "When true, descend into subdirectories. Defaults to false (single-level listing).",
    ),
  maxDepth: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Maximum recursion depth when recursive is true. The root is depth 0. Defaults to 5.",
    ),
  showHidden: z
    .boolean()
    .optional()
    .describe("Include dotfiles (entries starting with `.`). Defaults to false."),
});

interface ListEntry {
  readonly name: string;
  readonly relativePath: string;
  readonly depth: number;
  readonly isDirectory: boolean;
  readonly size: number;
  readonly mtime: Date;
}

/**
 * Create an `ls` tool for listing directory contents.
 *
 * Output is one entry per line, indented two spaces per depth level.
 * Directories are suffixed with `/`; files include right-aligned size
 * and ISO-date columns. The format is intentionally line-oriented and
 * column-aligned so it parses cleanly when fed back into the agent's
 * context.
 *
 * @example
 * ```ts
 * const ls = createLsTool();
 * const result = await ls.execute(
 *   { path: "src", recursive: true, maxDepth: 2 },
 *   ctx,
 * );
 * ```
 */
export function createLsTool(config?: LsToolConfig): ToolDefinition<typeof lsParams> {
  const defaultMaxDepth = config?.defaultMaxDepth ?? DEFAULT_MAX_DEPTH;
  const maxEntries = config?.maxEntries ?? DEFAULT_MAX_ENTRIES;

  return defineTool({
    description:
      "List directory entries with type, size, and last-modified time. " +
      "Use `recursive: true` to descend into subdirectories (capped by `maxDepth`). " +
      "Hidden entries (names starting with `.`) are excluded unless `showHidden: true`.",
    parameters: lsParams,
    execute: async (validatedArguments, toolContext) => {
      const rawPath = validatedArguments.path;
      const recursive = validatedArguments.recursive ?? false;
      const maxDepth = validatedArguments.maxDepth ?? defaultMaxDepth;
      const showHidden = validatedArguments.showHidden ?? false;

      // Authorize read access before any I/O.
      let path: string;
      try {
        path = await toolContext.sandbox.authorizeRead(rawPath, {
          agentName: toolContext.agentName,
          toolName: "ls",
          signal: toolContext.abort,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          output: `Permission denied: ${message}`,
          metadata: { error: true, path: rawPath },
        };
      }

      let rootStat: Awaited<ReturnType<typeof stat>>;
      try {
        rootStat = await stat(path);
      } catch {
        return {
          output: `Error: path not found: ${path}`,
          metadata: { error: true, path },
        };
      }

      if (!rootStat.isDirectory()) {
        return {
          output: `Error: not a directory: ${path}`,
          metadata: { error: true, path },
        };
      }

      const entries: ListEntry[] = [];
      let truncated = false;

      // Iterative breadth-first walk so we can cleanly enforce both
      // `maxDepth` and `maxEntries` without unbounded recursion. Sorting
      // each directory's entries (dirs first, then alphabetical) makes
      // output stable across filesystems.
      const queue: { absolutePath: string; relativePath: string; depth: number }[] = [
        { absolutePath: path, relativePath: "", depth: 0 },
      ];

      walk: while (queue.length > 0) {
        // biome-ignore lint/style/noNonNullAssertion: length checked above
        const current = queue.shift()!;

        let dirents: Dirent[];
        try {
          dirents = await readdir(current.absolutePath, { withFileTypes: true });
        } catch {
          // Permission errors etc. — skip this directory but keep going.
          continue;
        }

        const visible = dirents
          .filter((entry) => showHidden || !entry.name.startsWith(HIDDEN_PREFIX))
          .sort((entryA, entryB) => {
            // Directories first, then case-insensitive alphabetical.
            if (entryA.isDirectory() !== entryB.isDirectory()) {
              return entryA.isDirectory() ? -1 : 1;
            }
            return entryA.name.localeCompare(entryB.name);
          });

        for (const entry of visible) {
          if (entries.length >= maxEntries) {
            truncated = true;
            break walk;
          }

          const entryAbsolute = join(current.absolutePath, entry.name);
          const entryRelative = current.relativePath
            ? `${current.relativePath}/${entry.name}`
            : entry.name;

          let entryStat: Awaited<ReturnType<typeof stat>>;
          try {
            entryStat = await stat(entryAbsolute);
          } catch {
            // Broken symlink etc. — skip this entry.
            continue;
          }

          entries.push({
            name: entry.name,
            relativePath: entryRelative,
            depth: current.depth,
            isDirectory: entry.isDirectory(),
            size: entryStat.size,
            mtime: entryStat.mtime,
          });

          if (entry.isDirectory() && recursive && current.depth + 1 <= maxDepth) {
            queue.push({
              absolutePath: entryAbsolute,
              relativePath: entryRelative,
              depth: current.depth + 1,
            });
          }
        }
      }

      if (entries.length === 0) {
        return {
          output: "[Empty directory]",
          metadata: {
            path,
            recursive,
            maxDepth,
            entries: 0,
          },
        };
      }

      const output = formatEntries(entries);
      const trailer = truncated
        ? `\n\n(Truncated at ${maxEntries} entries. Narrow the path or lower maxDepth to see more.)`
        : "";

      return {
        output: `${output}${trailer}`,
        metadata: {
          path,
          recursive,
          maxDepth,
          entries: entries.length,
          truncated,
        },
      };
    },
  });
}

/** Render the queue of walked entries as a column-aligned, indented listing. */
function formatEntries(entries: readonly ListEntry[]): string {
  // Compute width for the name column so size/date columns align across
  // depths. We pad the indented name to the longest indented-name length.
  let nameColumnWidth = 0;
  for (const entry of entries) {
    const indented = INDENT_PER_DEPTH.repeat(entry.depth) + entry.name + (entry.isDirectory ? "/" : "");
    if (indented.length > nameColumnWidth) nameColumnWidth = indented.length;
  }

  let sizeColumnWidth = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const formatted = formatSize(entry.size);
    if (formatted.length > sizeColumnWidth) sizeColumnWidth = formatted.length;
  }

  return entries
    .map((entry) => {
      const indentedName =
        INDENT_PER_DEPTH.repeat(entry.depth) +
        entry.name +
        (entry.isDirectory ? "/" : "");
      const namePart = indentedName.padEnd(nameColumnWidth);
      if (entry.isDirectory) {
        return `${namePart}  dir`;
      }
      const sizePart = formatSize(entry.size).padStart(sizeColumnWidth);
      const datePart = formatDate(entry.mtime);
      return `${namePart}  ${sizePart}  ${datePart}`;
    })
    .join("\n");
}

/** Human-readable byte count: `B`, `KB`, `MB`, `GB`. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** ISO date in `YYYY-MM-DD` form — sortable and unambiguous across locales. */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
