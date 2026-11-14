import { z } from "zod";
import { compileGlob } from "../../../glob/glob";
import { defineTool } from "../../define/define-tool";
import { errorResult, okResult } from "../../result";
import type { FileSearchIssue, ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import { fileToolError, walkFiles } from "../walk-files";
import type { GlobData, GlobMatch, GlobToolConfig } from "./glob.types";
import { formatGlobResults } from "./glob.utils";

export const globParams = z
  .object({
    pattern: z
      .string()
      .min(1)
      .describe(
        "Glob pattern relative to root; * lists immediate children, **/*.ts finds TypeScript files recursively.",
      ),
    root: z
      .string()
      .optional()
      .describe('Workspace-relative directory. Defaults to ".".'),
    excludeGlobs: z
      .array(z.string())
      .optional()
      .describe(
        "Root-relative exclusion patterns replacing the defaults. Pass [] to disable exclusions.",
      ),
    maxResults: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Result limit, capped by application configuration. Defaults to 1000.",
      ),
  })
  .strict();

/**
 * Find workspace files, directories, and symlinks by path pattern.
 * @param {GlobToolConfig} [config] - Application limits for traversal and output.
 * @returns {ToolDefinition} A bounded path-discovery tool.
 * @example
 * const tool = createGlobTool();
 */
export function createGlobTool(
  config?: GlobToolConfig,
): ToolDefinition<typeof globParams, GlobData> {
  const resultCap = config?.maxResults ?? 1000;
  const maxDepth = config?.maxDepth ?? 32;
  const maxOutputBytes = config?.maxOutputBytes ?? 256 * 1024;
  if (
    [resultCap, maxDepth, maxOutputBytes].some(
      (limit) => !Number.isSafeInteger(limit) || limit < 1,
    )
  ) {
    throw new Error("glob limits must be positive safe integers.");
  }
  return defineTool({
    description: describeTool({
      purpose:
        "Find files, directories, and symlinks by path pattern. Use grep to search contents and read_file to read text.",
      inputs: [
        {
          name: "pattern",
          type: "string",
          required: true,
          description:
            "Root-relative glob. * lists immediate children; **/*.ts searches recursively.",
        },
        {
          name: "root",
          type: "string",
          required: false,
          defaultValue: '"."',
          description: "Workspace-relative directory.",
        },
        {
          name: "excludeGlobs",
          type: "string[]",
          required: false,
          description:
            "Root-relative exclusions replacing defaults. [] disables exclusions.",
        },
        {
          name: "maxResults",
          type: "number",
          required: false,
          defaultValue: String(resultCap),
          description: "Result limit, capped by application configuration.",
        },
      ],
      outputs:
        "{ matches: [{ path, type }], truncated, incompleteReasons }. Paths are workspace-relative; incompleteReasons explains omitted work.",
      errors: [
        {
          kind: "not_found",
          description: "Root does not exist or is not a directory.",
        },
        { kind: "permission_denied", description: "Root is not readable." },
        { kind: "outside_workspace", description: "Root escapes the sandbox." },
      ],
      notes: [
        "Hidden entries are included; .git, node_modules, dist, build, .next, .turbo, and coverage are excluded by default. Symlinks are reported but not traversed. Cancellation aborts the call.",
      ],
    }),
    parameters: globParams,
    execute: async (
      { pattern, root = ".", excludeGlobs, maxResults },
      toolContext,
    ) => {
      const issues = new Set<FileSearchIssue>();
      const matches: GlobMatch[] = [];
      const matchesPattern = compileGlob(pattern);
      const recursivePattern =
        pattern.includes("**") || pattern.startsWith("!");
      const patternDepth = pattern.split("/").length;
      const traversalDepth = recursivePattern
        ? maxDepth
        : Math.min(maxDepth, patternDepth);
      const resultLimit = Math.min(maxResults ?? resultCap, resultCap);
      // Reserve enough room for the summary and every incompleteness reason.
      const headerBytes = Buffer.byteLength(
        formatGlobResults({
          matches: [],
          truncated: true,
          incompleteReasons: [
            "result_limit",
            "output_limit",
            "depth_limit",
            "unreadable_path",
            "file_too_large",
          ],
        }),
      );
      let outputBytes = headerBytes + String(resultLimit).length;
      try {
        for await (const entry of walkFiles(
          { root, excludeGlobs, maxDepth: traversalDepth, toolName: "glob" },
          toolContext,
          issues,
        )) {
          if (!matchesPattern(entry.relativePath)) {
            continue;
          }
          if (matches.length >= resultLimit) {
            issues.add("result_limit");
            break;
          }
          const lineBytes = Buffer.byteLength(
            `${entry.path}${entry.type === "directory" ? "/" : ""} (${entry.type})\n`,
          );
          if (outputBytes + lineBytes > maxOutputBytes) {
            issues.add("output_limit");
            break;
          }
          matches.push({ path: entry.path, type: entry.type });
          outputBytes += lineBytes;
        }
        toolContext.abort.throwIfAborted();
      } catch (caught) {
        toolContext.abort.throwIfAborted();
        return errorResult<GlobData>(fileToolError(caught, root));
      }
      if (!recursivePattern && patternDepth <= maxDepth) {
        issues.delete("depth_limit");
      }
      const data: GlobData = {
        matches,
        truncated: issues.size > 0,
        incompleteReasons: [...issues],
      };
      const output = formatGlobResults(data);
      if (Buffer.byteLength(output) > maxOutputBytes) {
        return errorResult({
          kind: "file_too_large",
          message: "Output budget is too small for a search summary.",
          recoverable: false,
        });
      }
      return okResult(output, { data });
    },
  });
}
