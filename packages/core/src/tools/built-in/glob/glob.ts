import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { SandboxViolationError } from "../../../errors";
import { defineTool } from "../../define/define-tool";
import { sandboxErrorToToolError } from "../../io";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import {
  DEFAULT_EXCLUDE_GLOBS,
  DEFAULT_MAX_RESULTS,
  DEFAULT_TRAVERSAL_DEPTH,
} from "./glob.constants";
import type { GlobData, GlobMatch, GlobToolConfig } from "./glob.types";
import {
  formatGlobResults,
  matchesAnyGlob,
  toForwardSlash,
} from "./glob.utils";

export const globParams = z.object({
  pattern: z
    .string()
    .min(1)
    .describe(
      'The glob pattern to match files and folders against (e.g., "src/**/*.ts" or "**/*.json").',
    ),
  root: z
    .string()
    .optional()
    .describe(
      'Workspace-relative directory to search under. Defaults to "." (the workspace root).',
    ),
  excludeGlobs: z
    .array(z.string())
    .optional()
    .describe(
      "Glob patterns to exclude. Replaces the default exclude set " +
        "(node_modules, .git, dist, build, .next, .turbo, coverage). Pass [] to disable.",
    ),
  maxResults: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of matches to return. Defaults to 1000."),
});

/**
 * Create a Glob Tool to find both files and folders matching a glob pattern.
 *
 * @param config - Config options for limits like maxResults and maxDepth.
 */
export function createGlobTool(
  config?: GlobToolConfig,
): ToolDefinition<typeof globParams, GlobData> {
  const maxResultsCap = config?.maxResults ?? DEFAULT_MAX_RESULTS;
  const maxDepth = config?.maxDepth ?? DEFAULT_TRAVERSAL_DEPTH;

  return defineTool<typeof globParams, GlobData>({
    description: describeTool({
      purpose:
        "Search the workspace for files and folders matching a glob pattern.",
      inputs: [
        {
          name: "pattern",
          type: "string",
          required: true,
          description:
            'Glob pattern to match (e.g., "src/**/*.ts" or "**/*.json").',
        },
        {
          name: "root",
          type: "string",
          required: false,
          defaultValue: '"."',
          description: "Workspace-relative directory to search under.",
        },
        {
          name: "excludeGlobs",
          type: "string[]",
          required: false,
          defaultValue:
            "node_modules / .git / dist / build / .next / .turbo / coverage",
          description: "Glob patterns to exclude from traversal and matching.",
        },
        {
          name: "maxResults",
          type: "number",
          required: false,
          defaultValue: `${maxResultsCap}`,
          description:
            "Cap on the number of matches; sets `data.truncated` when hit.",
        },
      ],
      outputs: "`{ matches: [{ path, type, size, mtime }], truncated }`.",
      errors: [
        {
          kind: "not_found",
          description: "`root` is missing or not a directory.",
        },
        {
          kind: "outside_workspace",
          description:
            "`root` escapes the sandbox or is absolute when not allowed.",
        },
        {
          kind: "permission_denied",
          description: "`root` is read-blocked by the sandbox.",
        },
      ],
      notes: [`Traversal is capped at depth ${maxDepth}.`],
    }),
    parameters: globParams,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort, agentName } = toolContext;
      const rootArg = validatedArguments.root ?? ".";
      const excludeGlobs =
        validatedArguments.excludeGlobs ?? DEFAULT_EXCLUDE_GLOBS;
      const maxResults = Math.min(
        validatedArguments.maxResults ?? maxResultsCap,
        maxResultsCap,
      );

      const pathGlob = new Bun.Glob(validatedArguments.pattern);

      let absoluteRoot: string;
      try {
        absoluteRoot = await guard.authorize(
          { type: "fs.read", resource: rootArg },
          { agentName, toolName: "glob", signal: abort },
        );
      } catch (caught) {
        if (caught instanceof SandboxViolationError) {
          return errorResult<GlobData>(sandboxErrorToToolError(caught));
        }
        throw caught;
      }

      let rootStat: Awaited<ReturnType<typeof stat>>;
      try {
        rootStat = await stat(absoluteRoot);
      } catch (statError) {
        const code = (statError as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
          return errorResult<GlobData>(
            toolError("not_found", `Root does not exist: ${rootArg}`, {
              path: rootArg,
              recoverable: false,
            }),
          );
        }
        throw statError;
      }

      if (!rootStat.isDirectory()) {
        return errorResult<GlobData>(
          toolError("not_found", `Root is not a directory: ${rootArg}`, {
            path: rootArg,
            recoverable: false,
          }),
        );
      }

      const matches: GlobMatch[] = [];
      let truncated = false;

      type QueueItem = { absolutePath: string; depth: number };
      const queue: QueueItem[] = [{ absolutePath: absoluteRoot, depth: 0 }];

      outer: while (queue.length > 0) {
        if (abort.aborted) break;
        const node = queue.shift();
        if (!node) continue;
        if (node.depth >= maxDepth) continue;

        let dirents: Dirent[];
        try {
          dirents = (await readdir(node.absolutePath, {
            withFileTypes: true,
            encoding: "utf8",
          })) as Dirent[];
        } catch {
          continue;
        }

        for (const dirent of dirents) {
          if (abort.aborted) break outer;

          const childAbs = join(node.absolutePath, dirent.name);
          const relFromRoot = toForwardSlash(relative(absoluteRoot, childAbs));
          const relFromWorkspace = toForwardSlash(
            relative(guard.cwd, childAbs),
          );

          if (matchesAnyGlob(relFromWorkspace, excludeGlobs)) continue;

          const isDir = dirent.isDirectory();
          if (isDir) {
            queue.push({ absolutePath: childAbs, depth: node.depth + 1 });
          }

          if (!dirent.isFile() && !isDir && !dirent.isSymbolicLink()) continue;

          if (
            !guard.canAccess({ type: "fs.read", resource: relFromWorkspace })
          ) {
            continue;
          }

          if (pathGlob.match(relFromRoot)) {
            if (matches.length >= maxResults) {
              truncated = true;
              break outer;
            }

            const type: GlobMatch["type"] = dirent.isSymbolicLink()
              ? "symlink"
              : isDir
                ? "directory"
                : "file";

            let size = 0;
            let mtime = new Date(0).toISOString();
            if (type !== "symlink") {
              try {
                const childStat = await stat(childAbs);
                size = type === "directory" ? 0 : childStat.size;
                mtime = childStat.mtime.toISOString();
              } catch {
                continue;
              }
            }

            matches.push({
              path: relFromWorkspace,
              type,
              size,
              mtime,
            });
          }
        }
      }

      const data: GlobData = {
        pattern: validatedArguments.pattern,
        root: rootArg,
        matches,
        truncated,
      };

      const output = formatGlobResults(data);

      return okResult<GlobData>(output, { data });
    },
  });
}
