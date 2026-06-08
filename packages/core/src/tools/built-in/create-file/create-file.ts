import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { SandboxViolationError } from "../../../errors";
import { defineTool } from "../../define/define-tool";
import {
  buildAuditBase,
  createMemoryAuditSink,
  logAuditFailure,
  logAuditSuccess,
  sandboxErrorToToolError,
  sha256OfBuffer,
  unifiedDiff,
  writeAtomic,
} from "../../io";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import type { CreateFileData, CreateFileToolConfig } from "./create-file.types";

const createFileParams = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      "Workspace-relative path of the file to create. Absolute paths are rejected unless " +
        "the sandbox is configured with `allowAbsolutePaths: true`.",
    ),
  content: z
    .string()
    .describe(
      "Full UTF-8 content for the new file. May be empty to create a zero-byte file.",
    ),
  createParentDirectories: z
    .boolean()
    .optional()
    .describe(
      "When true, missing parent directories are created (mkdir -p). When false (default), " +
        "a missing parent yields `not_found` — the LLM should re-call with this flag set.",
    ),
});

export function createCreateFileTool(
  config?: CreateFileToolConfig,
): ToolDefinition<typeof createFileParams, CreateFileData> {
  const defaultSink = config?.defaultAuditSink;

  return defineTool<typeof createFileParams, CreateFileData>({
    description: describeTool({
      purpose:
        "Create a brand-new file at `path` with the given UTF-8 content. Refuses to overwrite — use `write_file` for existing files.",
      inputs: [
        {
          name: "path",
          type: "string",
          required: true,
          description: "Workspace-relative path for the new file.",
        },
        {
          name: "content",
          type: "string",
          required: true,
          description:
            "UTF-8 content to write. Newline style of the input is preserved on disk.",
        },
        {
          name: "createParentDirectories",
          type: "boolean",
          required: false,
          defaultValue: "false",
          description:
            "Create missing parent directories. When `false`, a missing parent returns `not_found`.",
        },
      ],
      outputs:
        "`{ created: true, sha256, diff }` where `diff` is the unified diff from `/dev/null` to the new file. `sha256` can be reused as `expectedSha256` on a follow-up `write_file` / `edit_file` call.",
      errors: [
        {
          kind: "already_exists",
          description:
            "A file already exists at `path` — call `write_file` with `expectedSha256` instead.",
        },
        {
          kind: "not_found",
          description:
            "Parent directory missing and `createParentDirectories` is false.",
        },
        {
          kind: "outside_workspace",
          description:
            "Path escapes the sandbox root or is absolute when not allowed.",
        },
        {
          kind: "permission_denied",
          description:
            "Path is write-blocked by the sandbox or matches a forbidden glob.",
        },
      ],
      notes: [
        "Atomic write: content is staged to a tmp file in the same directory, fsync'd, then renamed into place.",
        "Every create is appended to the audit log as a `create` operation.",
      ],
    }),
    systemPrompt: `### Using create_file

\`create_file\` makes a **new** file. If the path already exists you get \`already_exists\` — for overwrites, use \`write_file\` (which requires \`expectedSha256\` from a prior \`read_file\`).

**Required:**

- \`path\`: workspace-relative path to the new file (e.g. \`"src/components/Button/index.ts"\`).
- \`content\`: the file contents as a string.

**Useful optional:**

- \`createParentDirectories: true\`: create missing parent directories along the path. Use this freely — most "make a new file in a new folder" workflows need it.

**Decision tree:**

- New path → \`create_file\`.
- Existing path → \`write_file\` (full rewrite) or \`edit_file\` (surgical change).

The result includes \`sha256\` of the new file — save it if you plan to immediately edit or write to the file you just created.

**Post-create verification (MANDATORY):**

After every successful \`create_file\` call, **run the project's configured verifier on the new file (and the project as a whole) using \`run_command\`**. New files often have:

- Typos in identifiers that won't compile.
- Imports referencing modules that don't exist yet (or wrong paths to ones that do).
- Missing exports the rest of the codebase expects (especially when creating an \`index.ts\` barrel).

**If anything surfaces, fix it before reporting.**`,
    parameters: createFileParams,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort, agentName } = toolContext;
      const sink =
        toolContext.auditSink ?? defaultSink ?? createMemoryAuditSink();

      if (toolContext.abort.aborted) {
        return errorResult<CreateFileData>(
          toolError("command_failed", "Operation aborted before start.", {
            recoverable: false,
          }),
        );
      }

      let absolutePath: string;
      try {
        absolutePath = await guard.authorize(
          { type: "fs.write", resource: validatedArguments.path },
          { agentName, toolName: "create_file", signal: abort },
        );
      } catch (caught) {
        if (caught instanceof SandboxViolationError) {
          return errorResult<CreateFileData>(sandboxErrorToToolError(caught));
        }
        throw caught;
      }

      try {
        await stat(absolutePath);
        return errorResult<CreateFileData>(
          toolError(
            "already_exists",
            `File already exists: ${validatedArguments.path}`,
            {
              path: validatedArguments.path,
              recoverable: true,
              suggestedNextAction:
                "Use write_file (with expectedSha256) to replace existing content, or pick a different path.",
            },
          ),
        );
      } catch (statError) {
        const code = (statError as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTDIR") throw statError;
      }

      const parent = dirname(absolutePath);
      try {
        const parentStat = await stat(parent);
        if (!parentStat.isDirectory()) {
          return errorResult<CreateFileData>(
            toolError(
              "not_found",
              `Parent path is not a directory: ${validatedArguments.path}`,
              { path: validatedArguments.path, recoverable: false },
            ),
          );
        }
      } catch (statError) {
        const code = (statError as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw statError;
        if (!validatedArguments.createParentDirectories) {
          return errorResult<CreateFileData>(
            toolError(
              "not_found",
              `Parent directory does not exist: ${validatedArguments.path}`,
              {
                path: validatedArguments.path,
                recoverable: true,
                suggestedNextAction:
                  "Re-call create_file with `createParentDirectories: true`.",
              },
            ),
          );
        }
        await mkdir(parent, { recursive: true });
      }

      const contentBytes = new TextEncoder().encode(validatedArguments.content);
      const sha256 = sha256OfBuffer(contentBytes);
      const diff = unifiedDiff("", validatedArguments.content, {
        path: validatedArguments.path,
      });

      const auditBase = buildAuditBase(
        toolContext,
        "create_file",
        "create",
        validatedArguments.path,
        {
          afterSha256: sha256,
          diff,
        },
      );

      try {
        await writeAtomic(absolutePath, contentBytes);
      } catch (writeError) {
        const message = (writeError as Error).message;
        await logAuditFailure(sink, auditBase, message);
        return errorResult<CreateFileData>(
          toolError(
            "command_failed",
            `Failed to write ${validatedArguments.path}: ${message}`,
            {
              path: validatedArguments.path,
              recoverable: false,
            },
          ),
        );
      }

      await logAuditSuccess(sink, auditBase);

      const data: CreateFileData = {
        created: true,
        path: validatedArguments.path,
        sha256,
        sizeBytes: contentBytes.byteLength,
        diff,
      };

      return okResult<CreateFileData>(
        `Created ${validatedArguments.path} (${contentBytes.byteLength} bytes, sha256 ${sha256})`,
        { data },
      );
    },
  });
}
