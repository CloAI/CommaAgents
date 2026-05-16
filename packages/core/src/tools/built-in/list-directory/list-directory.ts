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
  DEFAULT_ABSOLUTE_MAX_DEPTH,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_RECURSIVE_DEPTH,
} from "./list-directory.constants";
import type {
  ListDirectoryData,
  ListDirectoryEntry,
  ListDirectoryToolConfig,
} from "./list-directory.types";
import {
  formatListing,
  toForwardSlash,
  typeRank,
} from "./list-directory.utils";

export const listDirectoryParams = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'Workspace-relative path to the directory to list. Use "." for the workspace root.',
    ),
  recursive: z
    .boolean()
    .optional()
    .describe("Recurse into subdirectories. Defaults to false (depth=1)."),
  maxDepth: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Maximum recursion depth (only meaningful with recursive:true). " +
        "Defaults to 8; capped at 32.",
    ),
  includeHidden: z
    .boolean()
    .optional()
    .describe('Include entries whose name starts with ".". Defaults to false.'),
});

export function createListDirectoryTool(
  config?: ListDirectoryToolConfig,
): ToolDefinition<typeof listDirectoryParams, ListDirectoryData> {
  const absoluteMaxDepth =
    config?.absoluteMaxDepth ?? DEFAULT_ABSOLUTE_MAX_DEPTH;
  const defaultRecursiveDepth =
    config?.defaultRecursiveDepth ?? DEFAULT_RECURSIVE_DEPTH;
  const maxEntries = config?.maxEntries ?? DEFAULT_MAX_ENTRIES;

  return defineTool<typeof listDirectoryParams, ListDirectoryData>({
    description: describeTool({
      purpose:
        "List the entries of a workspace directory and return both a structured array and a human-readable tree view.",
      inputs: [
        {
          name: "path",
          type: "string",
          required: true,
          description:
            "Workspace-relative directory to list. Use `.` for the workspace root.",
        },
        {
          name: "recursive",
          type: "boolean",
          required: false,
          defaultValue: "false",
          description:
            "Walk subdirectories. Unbounded recursion is capped by `maxDepth`.",
        },
        {
          name: "maxDepth",
          type: "number",
          required: false,
          defaultValue: `${defaultRecursiveDepth} when recursive, 1 otherwise (hard cap ${absoluteMaxDepth})`,
          description: "Inclusive maximum depth relative to `path`.",
        },
        {
          name: "includeHidden",
          type: "boolean",
          required: false,
          defaultValue: "false",
          description: "Include dot-prefixed entries (`.git`, `.env`, etc.).",
        },
      ],
      outputs: [
        "`{ entries: [{ name, relativePath, type, size, mtime, depth }], truncated }`.",
        `Entries are sorted by (depth asc, type [directory < file < symlink], name asc). Symlinks are reported with \`type: "symlink"\` and \`size: 0\` and are not followed. Results are capped at ${maxEntries} entries; \`truncated\` flags when the cap was hit.`,
      ],
      errors: [
        {
          kind: "not_found",
          description: "Path is missing or is not a directory.",
        },
        {
          kind: "outside_workspace",
          description:
            "Path escapes the sandbox root or is absolute when not allowed.",
        },
        {
          kind: "permission_denied",
          description:
            "Path is read-blocked by the sandbox (entries blocked by forbidden globs are filtered silently from successful listings).",
        },
      ],
      notes: [
        "Entries blocked by `forbiddenGlobs` or `canRead` are filtered silently — best-effort listing semantics.",
      ],
    }),
    parameters: listDirectoryParams,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort, agentName } = toolContext;
      let absoluteRoot: string;
      try {
        absoluteRoot = await guard.authorize(
          { type: "fs.read", resource: validatedArguments.path },
          { agentName, toolName: "list_directory", signal: abort },
        );
      } catch (caught) {
        if (caught instanceof SandboxViolationError) {
          return errorResult<ListDirectoryData>(
            sandboxErrorToToolError(caught),
          );
        }
        throw caught;
      }

      let rootStat: Awaited<ReturnType<typeof stat>>;
      try {
        rootStat = await stat(absoluteRoot);
      } catch (statError) {
        const code = (statError as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
          return errorResult<ListDirectoryData>(
            toolError(
              "not_found",
              `Directory does not exist: ${validatedArguments.path}`,
              {
                path: validatedArguments.path,
                recoverable: false,
              },
            ),
          );
        }
        if (code === "EACCES" || code === "EPERM") {
          return errorResult<ListDirectoryData>(
            toolError(
              "permission_denied",
              `Cannot stat directory: ${validatedArguments.path}`,
              {
                path: validatedArguments.path,
                recoverable: false,
              },
            ),
          );
        }
        throw statError;
      }

      if (!rootStat.isDirectory()) {
        return errorResult<ListDirectoryData>(
          toolError(
            "not_found",
            `Path is not a directory: ${validatedArguments.path}. Use read_file instead.`,
            {
              path: validatedArguments.path,
              recoverable: true,
              suggestedNextAction: `Call read_file with path="${validatedArguments.path}".`,
            },
          ),
        );
      }

      const recursive = validatedArguments.recursive ?? false;
      const requestedDepth =
        validatedArguments.maxDepth ?? (recursive ? defaultRecursiveDepth : 1);
      const effectiveDepth = Math.min(
        Math.max(1, recursive ? requestedDepth : 1),
        absoluteMaxDepth,
      );
      const includeHidden = validatedArguments.includeHidden ?? false;

      const collected: ListDirectoryEntry[] = [];
      let truncated = false;

      type QueueItem = {
        absolutePath: string;
        relativeFromRoot: string;
        depth: number;
      };
      const queue: QueueItem[] = [
        { absolutePath: absoluteRoot, relativeFromRoot: "", depth: 0 },
      ];

      while (queue.length > 0) {
        const node = queue.shift()!;
        if (node.depth >= effectiveDepth) continue;

        let dirents: Dirent[];
        try {
          dirents = (await readdir(node.absolutePath, {
            withFileTypes: true,
            encoding: "utf8",
          })) as Dirent[];
        } catch (caughtError) {
          const code = (caughtError as NodeJS.ErrnoException).code;
          if (code === "EACCES" || code === "EPERM" || code === "ENOENT") {
            continue;
          }
          throw caughtError;
        }

        for (const dirent of dirents) {
          if (!includeHidden && dirent.name.startsWith(".")) continue;

          const childAbs = join(node.absolutePath, dirent.name);
          const childRelFromRoot = node.relativeFromRoot
            ? `${node.relativeFromRoot}/${dirent.name}`
            : dirent.name;
          const childRelFromWorkspace = toForwardSlash(
            relative(guard.cwd, childAbs),
          );
          if (!guard.canAccess({ type: "fs.read", resource: childRelFromWorkspace })) continue;

          const type: ListDirectoryEntry["type"] = dirent.isSymbolicLink()
            ? "symlink"
            : dirent.isDirectory()
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

          if (collected.length >= maxEntries) {
            truncated = true;
            break;
          }

          collected.push({
            name: dirent.name,
            relativePath: childRelFromRoot,
            type,
            size,
            mtime,
            depth: node.depth + 1,
          });

          if (type === "directory" && node.depth + 1 < effectiveDepth) {
            queue.push({
              absolutePath: childAbs,
              relativeFromRoot: childRelFromRoot,
              depth: node.depth + 1,
            });
          }
        }
        if (truncated) break;
      }

      collected.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        const tr = typeRank(a.type) - typeRank(b.type);
        if (tr !== 0) return tr;
        return a.name.localeCompare(b.name);
      });

      const data: ListDirectoryData = {
        path: validatedArguments.path,
        entries: collected,
        maxDepth: effectiveDepth,
        truncated,
      };

      return okResult<ListDirectoryData>(formatListing(data), { data });
    },
  });
}
