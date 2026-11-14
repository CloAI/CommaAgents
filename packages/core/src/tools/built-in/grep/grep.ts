import { lstat, open } from "node:fs/promises";
import { z } from "zod";

import { compileGlob } from "../../../glob/glob";
import { defineTool } from "../../define/define-tool";
import { isLikelyBinary, stripBom, toLF } from "../../io";
import { errorResult, okResult, toolError } from "../../result";
import type {
  FileSearchIssue,
  ToolDefinition,
  ToolError,
  ToolResult,
} from "../../tool.types";
import { describeTool } from "../describe-tool";
import { fileToolError, walkFiles } from "../walk-files";
import type { GrepData, GrepMatch, GrepToolConfig } from "./grep.types";

/** Parameters for line-local literal or regular-expression content search. */
export const grepParams = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        "Literal text to find, or a line-local regular expression when regex is true.",
      ),
    root: z
      .string()
      .optional()
      .describe('Workspace-relative directory to search. Defaults to ".".'),
    regex: z
      .boolean()
      .optional()
      .describe("Treat query as a regular expression. Defaults to false."),
    ignoreCase: z
      .boolean()
      .optional()
      .describe("Ignore letter case. Defaults to false."),
    includeGlobs: z
      .array(z.string())
      .optional()
      .describe("Only search files matching these root-relative globs."),
    excludeGlobs: z
      .array(z.string())
      .optional()
      .describe(
        "Root-relative exclusion globs. Replaces default exclusions; [] disables them.",
      ),
    contextLines: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Lines before and after each matching line. Defaults to 0."),
    maxResults: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Maximum matching lines, capped by the host limit. Defaults to 100.",
      ),
  })
  .strict();

/**
 * Search file contents for literal text or a line-local regular expression.
 *
 * @param {GrepToolConfig} config - Host limits for traversal, file reads, results, and output.
 * @returns {ToolDefinition} A content search tool.
 * @example
 * const grep = createGrepTool({ maxResults: 100 });
 */
export function createGrepTool(
  config?: GrepToolConfig,
): ToolDefinition<typeof grepParams, GrepData> {
  const maxResultsCap = config?.maxResults ?? 100;
  const maxDepth = config?.maxDepth ?? 32;
  const maxFileBytes = config?.maxFileBytes ?? 4 * 1024 * 1024;
  const maxOutputBytes = config?.maxOutputBytes ?? 256 * 1024;
  if (
    [maxResultsCap, maxDepth, maxFileBytes, maxOutputBytes].some(
      (limit) => !Number.isSafeInteger(limit) || limit < 1,
    )
  ) {
    throw new Error("grep limits must be positive safe integers.");
  }

  return defineTool<typeof grepParams, GrepData>({
    description: describeTool({
      purpose:
        "Search file contents for literal text or line-local regular expressions. Use glob to find paths and read_file to read files.",
      inputs: [
        {
          name: "query",
          type: "string",
          required: true,
          description:
            "Literal text, or a regular expression when regex is true.",
        },
        {
          name: "root",
          type: "string",
          required: false,
          defaultValue: '"."',
          description: "Directory to search.",
        },
        {
          name: "regex",
          type: "boolean",
          required: false,
          defaultValue: "false",
          description: "Interpret query as a line-local regular expression.",
        },
        {
          name: "ignoreCase",
          type: "boolean",
          required: false,
          defaultValue: "false",
          description: "Ignore letter case.",
        },
        {
          name: "includeGlobs",
          type: "string[]",
          required: false,
          description: "Only search matching root-relative paths.",
        },
        {
          name: "excludeGlobs",
          type: "string[]",
          required: false,
          description:
            "Root-relative exclusions; replaces defaults. [] disables exclusions.",
        },
        {
          name: "contextLines",
          type: "number",
          required: false,
          defaultValue: "0",
          description: "Surrounding lines per match.",
        },
        {
          name: "maxResults",
          type: "number",
          required: false,
          defaultValue: String(maxResultsCap),
          description: "Maximum matching lines, capped by host configuration.",
        },
      ],
      outputs:
        "`{ matches: [{ path, line, column, preview }], truncated, incompleteReasons }`. Paths are workspace-relative; positions are 1-based. Returns the first match per line.",
      errors: [
        {
          kind: "command_failed",
          description:
            "Invalid regex. Correct the syntax or use regex:false for literal text.",
        },
        {
          kind: "not_found",
          description: "Root is missing or is not a directory.",
        },
        {
          kind: "outside_workspace",
          description: "Root escapes the workspace.",
        },
        {
          kind: "permission_denied",
          description: "Root is blocked or unreadable.",
        },
      ],
      notes: [
        "Binary files and child symlinks are skipped. Limits and unreadable files are reported in output and incompleteReasons; cancellation aborts the call.",
      ],
    }),
    parameters: grepParams,
    execute: async (args, context) => {
      context.abort.throwIfAborted();
      let matcher: RegExp;
      try {
        const pattern = args.regex
          ? args.query
          : args.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        matcher = new RegExp(pattern, args.ignoreCase ? "i" : "");
      } catch (caught) {
        return boundedError(
          toolError(
            "command_failed",
            `Invalid regular expression: ${caught instanceof Error ? caught.message : String(caught)}`,
            {
              recoverable: true,
              suggestedNextAction:
                "Correct the regex syntax or retry with regex:false to search for literal text.",
            },
          ),
          maxOutputBytes,
        );
      }

      const includes = args.includeGlobs?.map(compileGlob);
      const issues = new Set<FileSearchIssue>();
      const matches: GrepMatch[] = [];
      const outputParts: string[] = [];
      const maxResults = Math.min(
        args.maxResults ?? maxResultsCap,
        maxResultsCap,
      );
      const contextLines = args.contextLines ?? 0;
      let outputBytes = 0;

      try {
        search: for await (const entry of walkFiles(
          {
            root: args.root ?? ".",
            excludeGlobs: args.excludeGlobs,
            maxDepth,
            toolName: "grep",
          },
          context,
          issues,
        )) {
          if (
            entry.type !== "file" ||
            (includes &&
              !includes.some((include) => include(entry.relativePath)))
          ) {
            continue;
          }
          let bytes: Buffer | undefined;
          try {
            bytes = await readBoundedFile(
              entry.absolutePath,
              maxFileBytes,
              context.abort,
            );
          } catch (caught) {
            context.abort.throwIfAborted();
            if (caught instanceof Error && caught.name === "AbortError") {
              throw caught;
            }
            issues.add("unreadable_path");
            continue;
          }
          if (bytes === undefined) {
            issues.add("file_too_large");
            continue;
          }
          if (isLikelyBinary(bytes)) {
            continue;
          }
          const lines = stripBom(toLF(bytes.toString("utf8"))).split("\n");
          for (let index = 0; index < lines.length; index++) {
            context.abort.throwIfAborted();
            const match = matcher.exec(lines[index]!);
            if (!match) {
              continue;
            }
            if (matches.length >= maxResults) {
              issues.add("result_limit");
              break search;
            }
            const preview = buildPreview(lines, index, contextLines);
            const candidate = {
              path: entry.path,
              line: index + 1,
              column: match.index + 1,
              preview,
            };
            const output = `${candidate.path}:${candidate.line}:${candidate.column}\n${preview}`;
            const byteLength =
              Buffer.byteLength(output, "utf8") + (outputParts.length ? 2 : 0);
            if (outputBytes + byteLength > maxOutputBytes) {
              issues.add("output_limit");
              break search;
            }
            matches.push(candidate);
            outputParts.push(output);
            outputBytes += byteLength;
          }
        }
        context.abort.throwIfAborted();
      } catch (caught) {
        context.abort.throwIfAborted();
        if (caught instanceof Error && caught.name === "AbortError") {
          throw caught;
        }
        return boundedError(
          fileToolError(caught, args.root ?? "."),
          maxOutputBytes,
        );
      }

      // Keep the completeness summary visible to models that only receive output.
      if (issues.size > 0) {
        while (
          Buffer.byteLength(formatOutput(outputParts, issues), "utf8") >
            maxOutputBytes &&
          outputParts.length > 0
        ) {
          outputParts.pop();
          matches.pop();
          issues.add("output_limit");
        }
      }
      const output = formatOutput(outputParts, issues);
      if (Buffer.byteLength(output, "utf8") > maxOutputBytes) {
        return boundedError(
          toolError(
            "command_failed",
            "grep output budget is too small for the result summary.",
            {
              recoverable: false,
              suggestedNextAction: "Increase the host maxOutputBytes limit.",
            },
          ),
          maxOutputBytes,
        );
      }
      const data: GrepData = {
        matches,
        truncated: issues.size > 0,
        incompleteReasons: [...issues],
      };
      return okResult<GrepData>(output, { data });
    },
  });
}

/**
 * Read at most one byte past the file limit, closing the handle on every path.
 * @param {string} path - Regular file path.
 * @param {number} maxBytes - Maximum permitted file size.
 * @param {AbortSignal} signal - Cancellation signal.
 * @returns {Promise<Buffer | undefined>} Bytes, or undefined for oversized files.
 */
async function readBoundedFile(
  path: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer | undefined> {
  signal.throwIfAborted();
  const beforeOpen = await lstat(path);
  signal.throwIfAborted();
  if (!beforeOpen.isFile()) {
    throw new Error("Not a regular file.");
  }
  if (beforeOpen.size > maxBytes) {
    return undefined;
  }
  const handle = await open(path, "r");
  try {
    const details = await handle.stat();
    signal.throwIfAborted();
    if (!details.isFile()) {
      throw new Error("Not a regular file.");
    }
    if (details.size > maxBytes) {
      return undefined;
    }
    const chunks: Buffer[] = [];
    let length = 0;
    while (length <= maxBytes) {
      signal.throwIfAborted();
      const bytes = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1 - length));
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, null);
      signal.throwIfAborted();
      if (!bytesRead) {
        break;
      }
      chunks.push(bytes.subarray(0, bytesRead));
      length += bytesRead;
    }
    signal.throwIfAborted();
    return length > maxBytes ? undefined : Buffer.concat(chunks, length);
  } finally {
    await handle.close();
  }
}

/**
 * Include completeness information in the model-facing result text.
 * @param {readonly string[]} parts - Formatted whole matches.
 * @param {ReadonlySet<FileSearchIssue>} issues - Incomplete search reasons.
 * @returns {string} Model-facing result text.
 */
function formatOutput(
  parts: readonly string[],
  issues: ReadonlySet<FileSearchIssue>,
): string {
  const body = parts.join("\n\n");
  if (issues.size > 0) {
    return `${body}${body ? "\n\n" : ""}Search incomplete: ${[...issues].join(", ")}. Narrow root, includeGlobs, or query to search a smaller scope.`;
  }
  return body || "No matches.";
}

/**
 * Format a matching line with numbered surrounding context.
 * @param {readonly string[]} lines - Normalized file lines.
 * @param {number} index - Matching line index.
 * @param {number} contextLines - Surrounding line count.
 * @returns {string} Numbered matching lines and context.
 */
function buildPreview(
  lines: readonly string[],
  index: number,
  contextLines: number,
): string {
  const start = Math.max(0, index - contextLines);
  const end = Math.min(lines.length - 1, index + contextLines);
  return lines
    .slice(start, end + 1)
    .map((line, offset) => `${start + offset + 1}: ${line}`)
    .join("\n");
}

/**
 * Bound error text without losing structured recovery instructions.
 * @param {ToolError} error - Actionable tool error.
 * @param {number} maxBytes - Model output byte budget.
 * @returns {ToolResult<GrepData>} A bounded error response.
 */
function boundedError(
  error: ToolError,
  maxBytes: number,
): ToolResult<GrepData> {
  let output = "";
  let bytes = 0;
  for (const character of error.message) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > maxBytes) {
      break;
    }
    output += character;
    bytes += size;
  }
  return errorResult<GrepData>(error, { output });
}
