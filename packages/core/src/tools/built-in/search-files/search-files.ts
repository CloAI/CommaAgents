import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { SandboxViolationError } from "../../../errors";
import { defineTool } from "../../define/define-tool";
import { isLikelyBinary, sandboxErrorToToolError } from "../../io";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import {
  DEFAULT_CONTEXT_LINES,
  DEFAULT_EXCLUDE_GLOBS,
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MAX_RESULTS,
  DEFAULT_TRAVERSAL_DEPTH,
} from "./search-files.constants";
import type {
  SearchFilesData,
  SearchFilesMatch,
  SearchFilesToolConfig,
} from "./search-files.types";
import {
  buildPreview,
  compileRegex,
  matchesAnyGlob,
  toForwardSlash,
} from "./search-files.utils";

const searchFilesParams = z.object({
  query: z
    .string()
    .min(1)
    .describe("Search query. Interpretation depends on `mode`."),
  mode: z
    .enum(["path", "text", "regex"])
    .describe(
      'Search mode. "path" → glob-match file paths. "text" → literal substring search in ' +
        'file contents. "regex" → JavaScript regex search in file contents (compiled with the "m" flag).',
    ),
  root: z
    .string()
    .optional()
    .describe('Workspace-relative directory to search under. Defaults to ".".'),
  includeGlobs: z
    .array(z.string())
    .optional()
    .describe(
      "When set, only paths matching at least one of these Bun.Glob patterns are considered.",
    ),
  excludeGlobs: z
    .array(z.string())
    .optional()
    .describe(
      "Bun.Glob patterns to exclude. Replaces the default exclude set " +
        "(node_modules, .git, dist, build, .next, .turbo, coverage). Pass [] to disable.",
    ),
  maxResults: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of matches to return. Defaults to 100."),
  contextLines: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Number of context lines to include on either side of each text/regex match. Defaults to 0.",
    ),
});

export function createSearchFilesTool(
  config?: SearchFilesToolConfig,
): ToolDefinition<typeof searchFilesParams, SearchFilesData> {
  const maxResultsCap = config?.maxResults ?? DEFAULT_MAX_RESULTS;
  const maxFileBytes = config?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxDepth = config?.maxDepth ?? DEFAULT_TRAVERSAL_DEPTH;

  return defineTool<typeof searchFilesParams, SearchFilesData>({
    description: describeTool({
      purpose:
        "Search the workspace by path glob, literal text, or regex; returns structured match locations with optional context lines.",
      inputs: [
        {
          name: "query",
          type: "string",
          required: true,
          description:
            "Pattern to match. Interpretation depends on `mode`: glob (path), literal (text), or JS regex (regex).",
        },
        {
          name: "mode",
          type: '"path" | "text" | "regex"',
          required: true,
          description:
            '"path" matches file paths against a Bun.Glob; "text" searches file contents for a literal substring; "regex" compiles `query` as a JS regex with the "m" flag so ^/$ anchor on lines.',
        },
        {
          name: "root",
          type: "string",
          required: false,
          defaultValue: '"."',
          description: "Workspace-relative directory to search under.",
        },
        {
          name: "includeGlobs",
          type: "string[]",
          required: false,
          description: "Path globs that candidate files must match.",
        },
        {
          name: "excludeGlobs",
          type: "string[]",
          required: false,
          defaultValue:
            "node_modules / .git / dist / build / .next / .turbo / coverage",
          description: "Path globs that candidates must NOT match.",
        },
        {
          name: "maxResults",
          type: "number",
          required: false,
          defaultValue: `${maxResultsCap}`,
          description:
            "Cap on the number of matches; sets `data.truncated` when hit.",
        },
        {
          name: "contextLines",
          type: "number",
          required: false,
          defaultValue: "0",
          description:
            "Lines of surrounding context to include in each match's `preview`.",
        },
      ],
      outputs:
        "`{ matches: [{ path, line?, column?, preview }], truncated }`. `line`/`column` are 1-indexed and omitted for `path` mode.",
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
        {
          kind: "command_failed",
          description: "`query` is not a valid regex (regex mode only).",
        },
      ],
      notes: [
        `Binary files are skipped automatically in content modes. Files larger than ${maxFileBytes} bytes are skipped. Traversal is capped at depth ${maxDepth}.`,
      ],
    }),
    systemPrompt: `### Using search_files

\`search_files\` searches the workspace by file path **or** by file contents. Pick the right \`mode\`:

**\`mode: "path"\`** — match \`query\` as a **glob** against file paths. Equivalent to \`glob\` but as a search verb. Use this when you only need file names.

**\`mode: "text"\`** — search file **contents** for a **literal substring** (no regex escaping needed). Returns match locations with \`line\`/\`column\`/\`preview\`. **Use this for any "find usages of identifier X" search** unless you need regex.

**\`mode: "regex"\`** — search file contents with a **JavaScript regex** (compiled with the \`m\` flag, so \`^\` / \`$\` anchor on lines). Use only when you genuinely need pattern matching.

**Required:**

- \`query\`: the pattern. Interpretation depends on \`mode\`.
- \`mode\`: one of \`"path"\`, \`"text"\`, \`"regex"\`.

**Useful optional:**

- \`root\`: workspace-relative directory to search under. Defaults to \`"."\`.
- \`contextLines\`: lines of surrounding context to include in each \`preview\` (default 0, so just the matching line). \`contextLines: 2\` is a nice default for human-readable results.
- \`maxResults\`: cap on matches.
- \`includeGlobs\` / \`excludeGlobs\`: scope to specific files (e.g. \`includeGlobs: ["**/*.ts"]\`).

**Common uses:**

- "Find every import of \`createAgent\`" → \`mode: "text", query: "createAgent", includeGlobs: ["**/*.ts"]\`.
- "Find every file named \`*.test.ts\`" → \`mode: "path", query: "**/*.test.ts"\` (or just use \`glob\` directly).
- "Find every line ending with a TODO" → \`mode: "regex", query: "TODO\\\\s*$"\`.

**Tip:** binary files and files larger than the per-tool cap are skipped silently in content modes — your search won't find matches in them.`,
    parameters: searchFilesParams,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort, agentName } = toolContext;
      const rootArg = validatedArguments.root ?? ".";
      const mode = validatedArguments.mode;
      const includeGlobs = validatedArguments.includeGlobs;
      const excludeGlobs =
        validatedArguments.excludeGlobs ?? DEFAULT_EXCLUDE_GLOBS;
      const maxResults = Math.min(
        validatedArguments.maxResults ?? maxResultsCap,
        maxResultsCap,
      );
      const contextLines =
        validatedArguments.contextLines ?? DEFAULT_CONTEXT_LINES;

      let compiledRegex: RegExp | undefined;
      if (mode === "regex") {
        const compiled = compileRegex(validatedArguments.query);
        if (compiled.error) {
          return errorResult<SearchFilesData>(compiled.error);
        }
        compiledRegex = compiled.regex;
      }
      const pathGlob =
        mode === "path" ? new Bun.Glob(validatedArguments.query) : undefined;

      let absoluteRoot: string;
      try {
        absoluteRoot = await guard.authorize(
          { type: "fs.read", resource: rootArg },
          { agentName, toolName: "search_files", signal: abort },
        );
      } catch (caught) {
        if (caught instanceof SandboxViolationError) {
          return errorResult<SearchFilesData>(sandboxErrorToToolError(caught));
        }
        throw caught;
      }

      let rootStat: Awaited<ReturnType<typeof stat>>;
      try {
        rootStat = await stat(absoluteRoot);
      } catch (statError) {
        const code = (statError as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
          return errorResult<SearchFilesData>(
            toolError("not_found", `Root does not exist: ${rootArg}`, {
              path: rootArg,
              recoverable: false,
            }),
          );
        }
        throw statError;
      }
      if (!rootStat.isDirectory()) {
        return errorResult<SearchFilesData>(
          toolError("not_found", `Root is not a directory: ${rootArg}`, {
            path: rootArg,
            recoverable: false,
          }),
        );
      }

      const matches: SearchFilesMatch[] = [];
      let filesScanned = 0;
      let truncated = false;

      type QueueItem = { absolutePath: string; depth: number };
      const queue: QueueItem[] = [{ absolutePath: absoluteRoot, depth: 0 }];

      outer: while (queue.length > 0) {
        if (abort.aborted) break;
        const node = queue.shift()!;
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

          if (dirent.isDirectory()) {
            queue.push({ absolutePath: childAbs, depth: node.depth + 1 });
            continue;
          }

          if (!dirent.isFile()) continue;
          if (!guard.canAccess({ type: "fs.read", resource: relFromWorkspace }))
            continue;
          if (includeGlobs && !matchesAnyGlob(relFromRoot, includeGlobs))
            continue;

          if (mode === "path") {
            if (pathGlob?.match(relFromRoot)) {
              filesScanned++;
              if (matches.length >= maxResults) {
                truncated = true;
                break outer;
              }
              matches.push({ path: relFromWorkspace, preview: relFromRoot });
            }
            continue;
          }

          let childStat: Awaited<ReturnType<typeof stat>>;
          try {
            childStat = await stat(childAbs);
          } catch {
            continue;
          }
          if (childStat.size > maxFileBytes) continue;

          let buffer: Uint8Array;
          try {
            buffer = new Uint8Array(await Bun.file(childAbs).arrayBuffer());
          } catch {
            continue;
          }
          if (isLikelyBinary(buffer)) continue;
          filesScanned++;

          const text = new TextDecoder("utf-8").decode(buffer);
          const lines = text.split("\n");

          if (mode === "text") {
            const needle = validatedArguments.query;
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]!;
              const idx = line.indexOf(needle);
              if (idx === -1) continue;
              if (matches.length >= maxResults) {
                truncated = true;
                break outer;
              }
              matches.push({
                path: relFromWorkspace,
                line: i + 1,
                column: idx + 1,
                preview: buildPreview(lines, i, contextLines),
              });
            }
          } else {
            const regex = compiledRegex!;
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]!;
              const match = regex.exec(line);
              if (!match) continue;
              if (matches.length >= maxResults) {
                truncated = true;
                break outer;
              }
              matches.push({
                path: relFromWorkspace,
                line: i + 1,
                column: (match.index ?? 0) + 1,
                preview: buildPreview(lines, i, contextLines),
              });
              regex.lastIndex = 0;
            }
          }
        }
      }

      const data: SearchFilesData = {
        mode,
        query: validatedArguments.query,
        root: rootArg,
        matches,
        truncated,
        filesScanned,
      };

      const summaryHeader =
        matches.length === 0
          ? `No matches for ${mode}:"${validatedArguments.query}" under ${rootArg} (${filesScanned} files scanned)`
          : `Found ${matches.length} match${matches.length === 1 ? "" : "es"} for ${mode}:"${validatedArguments.query}" under ${rootArg}${truncated ? " (truncated)" : ""} — ${filesScanned} files scanned`;
      const lines = matches.map((m) =>
        m.line !== undefined
          ? `${m.path}:${m.line}:${m.column}\n${m.preview}`
          : m.path,
      );
      const output =
        matches.length === 0
          ? summaryHeader
          : `${summaryHeader}\n\n${lines.join("\n\n")}`;

      return okResult<SearchFilesData>(output, { data });
    },
  });
}
