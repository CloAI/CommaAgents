import * as fsp from "node:fs/promises";

const { copyFile, readFile, stat, unlink } = fsp;

import { dirname } from "node:path";
import { z } from "zod";
import { SandboxViolationError } from "../../../errors";
import { defineTool } from "../../define/define-tool";
import {
  createMemoryAuditSink,
  moveToTrash,
  STALE_FILE_RECOVERY_HINT,
  sandboxErrorToToolError,
  sha256OfBuffer,
  sha256OfFile,
} from "../../io";
import type { AuditEntry } from "../../io/audit";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import type { MoveFileData, MoveFileToolConfig } from "./move-file.types";

const moveFileParams = z.object({
  fromPath: z
    .string()
    .min(1)
    .describe(
      "Workspace-relative path of the existing file to move. Absolute paths are rejected " +
        "unless the sandbox is configured with `allowAbsolutePaths: true`.",
    ),
  toPath: z
    .string()
    .min(1)
    .describe(
      "Workspace-relative destination path. Parent directories must already exist (use " +
        "`create_file` to create directories on the fly). Directories are never valid as " +
        "a destination.",
    ),
  expectedSha256: z
    .string()
    .length(64)
    .regex(
      /^[0-9a-f]{64}$/,
      "expectedSha256 must be a 64-character lowercase hex string",
    )
    .describe(
      "SHA-256 of the source file's current on-disk bytes, as returned by `read_file`. " +
        "Required to detect concurrent edits — a mismatch yields `stale_file`.",
    ),
  overwrite: z
    .boolean()
    .optional()
    .describe(
      "When true, an existing regular file at `toPath` is moved to the workspace trash " +
        "before the rename. When false (default), an existing destination yields " +
        "`already_exists`. Destination directories are NEVER overwritten.",
    ),
});

export function createMoveFileTool(
  config?: MoveFileToolConfig,
): ToolDefinition<typeof moveFileParams, MoveFileData> {
  const defaultSink = config?.defaultAuditSink;

  return defineTool<typeof moveFileParams, MoveFileData>({
    description: describeTool({
      purpose:
        "Rename or move a regular file inside the workspace. Both paths must resolve inside the sandbox.",
      inputs: [
        {
          name: "fromPath",
          type: "string",
          required: true,
          description: "Workspace-relative path to the existing file.",
        },
        {
          name: "toPath",
          type: "string",
          required: true,
          description:
            "Workspace-relative destination path. Parent directory must already exist.",
        },
        {
          name: "expectedSha256",
          type: "string",
          required: true,
          description:
            "sha256 of `fromPath` as last read. Mismatch returns `stale_file`.",
        },
        {
          name: "overwrite",
          type: "boolean",
          required: false,
          defaultValue: "false",
          description:
            "Allow overwriting an existing file at `toPath`. The overwritten file is moved to the trash first; never allowed when `toPath` is a directory.",
        },
      ],
      outputs:
        "`{ moved: true, sha256, overwroteTrashedTo? }`. `sha256` is the post-move hash (re-verified) and equals `expectedSha256`.",
      errors: [
        {
          kind: "not_found",
          description:
            "`fromPath` does not exist or is a directory; or `toPath`'s parent directory is missing.",
        },
        {
          kind: "already_exists",
          description:
            "`toPath` exists and `overwrite` is not set, or `toPath` is a directory.",
        },
        {
          kind: "stale_file",
          description:
            "`expectedSha256` does not match `fromPath`'s current hash.",
        },
        {
          kind: "outside_workspace",
          description:
            "Either path escapes the sandbox root or is absolute when not allowed.",
        },
        {
          kind: "permission_denied",
          description:
            "Either path is blocked by the sandbox or matches a forbidden glob.",
        },
      ],
      notes: [
        "Uses `rename` on the same device; falls back to copy + unlink across devices (EXDEV).",
        "Every move is appended to the audit log as a `move` operation.",
      ],
    }),
    parameters: moveFileParams,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort, agentName, sessionId } = toolContext;
      const sink =
        toolContext.auditSink ?? defaultSink ?? createMemoryAuditSink();

      if (abort.aborted) {
        return errorResult<MoveFileData>(
          toolError("command_failed", "Operation aborted before start.", {
            recoverable: false,
          }),
        );
      }

      let fromAbs: string;
      let toAbs: string;
      try {
        fromAbs = await guard.authorize(
          { type: "fs.write", resource: validatedArguments.fromPath },
          { agentName, toolName: "move_file", signal: abort },
        );
        toAbs = await guard.authorize(
          { type: "fs.write", resource: validatedArguments.toPath },
          { agentName, toolName: "move_file", signal: abort },
        );
      } catch (caught) {
        if (caught instanceof SandboxViolationError) {
          return errorResult<MoveFileData>(sandboxErrorToToolError(caught));
        }
        throw caught;
      }

      if (validatedArguments.fromPath === validatedArguments.toPath) {
        return errorResult<MoveFileData>(
          toolError(
            "command_failed",
            "fromPath and toPath are identical — nothing to move.",
            {
              path: validatedArguments.fromPath,
              recoverable: false,
            },
          ),
        );
      }

      let fromStat: Awaited<ReturnType<typeof stat>>;
      try {
        fromStat = await stat(fromAbs);
      } catch (statError) {
        const code = (statError as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
          return errorResult<MoveFileData>(
            toolError(
              "not_found",
              `Source file does not exist: ${validatedArguments.fromPath}`,
              {
                path: validatedArguments.fromPath,
                recoverable: false,
              },
            ),
          );
        }
        throw statError;
      }
      if (fromStat.isDirectory()) {
        return errorResult<MoveFileData>(
          toolError(
            "not_found",
            `Source path is a directory, not a file: ${validatedArguments.fromPath}`,
            { path: validatedArguments.fromPath, recoverable: false },
          ),
        );
      }

      const beforeBytes = await readFile(fromAbs);
      const beforeSha256 = sha256OfBuffer(beforeBytes);
      if (beforeSha256 !== validatedArguments.expectedSha256) {
        return errorResult<MoveFileData>(
          toolError(
            "stale_file",
            `File has changed since last read: ${validatedArguments.fromPath}`,
            {
              path: validatedArguments.fromPath,
              recoverable: true,
              suggestedNextAction: STALE_FILE_RECOVERY_HINT,
              details: {
                expectedSha256: validatedArguments.expectedSha256,
                actualSha256: beforeSha256,
              },
            },
          ),
        );
      }

      let overwroteTrashedTo: string | undefined;
      try {
        const toStat = await stat(toAbs);
        if (toStat.isDirectory()) {
          return errorResult<MoveFileData>(
            toolError(
              "already_exists",
              `Destination is a directory: ${validatedArguments.toPath}`,
              { path: validatedArguments.toPath, recoverable: false },
            ),
          );
        }
        if (!validatedArguments.overwrite) {
          return errorResult<MoveFileData>(
            toolError(
              "already_exists",
              `Destination already exists: ${validatedArguments.toPath}`,
              {
                path: validatedArguments.toPath,
                recoverable: true,
                suggestedNextAction:
                  "Re-call move_file with `overwrite: true` to replace the existing file (it will be trashed for recovery).",
              },
            ),
          );
        }
        overwroteTrashedTo = await moveToTrash(guard.cwd, toAbs, {
          sessionId,
          agentName,
          ...guard.trashMetadata,
        });
      } catch (caughtError) {
        const code = (caughtError as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTDIR") throw caughtError;
        const parent = dirname(toAbs);
        try {
          const parentStat = await stat(parent);
          if (!parentStat.isDirectory()) {
            return errorResult<MoveFileData>(
              toolError(
                "not_found",
                `Destination parent is not a directory: ${validatedArguments.toPath}`,
                { path: validatedArguments.toPath, recoverable: false },
              ),
            );
          }
        } catch (parentStatError) {
          const c = (parentStatError as NodeJS.ErrnoException).code;
          if (c === "ENOENT") {
            return errorResult<MoveFileData>(
              toolError(
                "not_found",
                `Destination parent directory does not exist: ${validatedArguments.toPath}`,
                {
                  path: validatedArguments.toPath,
                  recoverable: true,
                  suggestedNextAction:
                    "Use create_file with `createParentDirectories: true` (then delete the placeholder) to create the directory, or pick a destination whose parent exists.",
                },
              ),
            );
          }
          throw parentStatError;
        }
      }

      try {
        await fsp.rename(fromAbs, toAbs);
      } catch (renameError) {
        const code = (renameError as NodeJS.ErrnoException).code;
        if (code === "EXDEV") {
          await copyFile(fromAbs, toAbs);
          await unlink(fromAbs);
        } else {
          const message = (renameError as Error).message;
          const failureBase: Omit<AuditEntry, "success"> = {
            timestamp: new Date().toISOString(),
            ...(sessionId !== undefined ? { sessionId } : {}),
            agentName,
            toolName: "move_file",
            operation: "move",
            path: validatedArguments.fromPath,
            toPath: validatedArguments.toPath,
            beforeSha256,
            ...(overwroteTrashedTo !== undefined
              ? { details: { overwroteTrashedTo } }
              : {}),
          };
          try {
            await sink.append({
              ...failureBase,
              success: false,
              error: message,
            });
          } catch {
            /* ignore */
          }
          return errorResult<MoveFileData>(
            toolError(
              "command_failed",
              `Failed to move ${validatedArguments.fromPath} → ${validatedArguments.toPath}: ${message}`,
              { path: validatedArguments.fromPath, recoverable: false },
            ),
          );
        }
      }

      const afterSha256 = await sha256OfFile(toAbs);
      if (afterSha256 !== beforeSha256) {
        return errorResult<MoveFileData>(
          toolError(
            "command_failed",
            `Post-move sha256 mismatch for ${validatedArguments.toPath} ` +
              `(expected ${beforeSha256}, got ${afterSha256})`,
            { path: validatedArguments.toPath, recoverable: false },
          ),
        );
      }

      const auditEntry: AuditEntry = {
        timestamp: new Date().toISOString(),
        ...(sessionId !== undefined ? { sessionId } : {}),
        agentName,
        toolName: "move_file",
        operation: "move",
        path: validatedArguments.fromPath,
        toPath: validatedArguments.toPath,
        beforeSha256,
        afterSha256,
        success: true,
        ...(overwroteTrashedTo !== undefined
          ? { details: { overwroteTrashedTo } }
          : {}),
      };
      try {
        await sink.append(auditEntry);
      } catch {
        /* audit failures are non-fatal */
      }

      const data: MoveFileData = {
        moved: true,
        fromPath: validatedArguments.fromPath,
        toPath: validatedArguments.toPath,
        sha256: afterSha256,
        sizeBytes: beforeBytes.byteLength,
        ...(overwroteTrashedTo !== undefined ? { overwroteTrashedTo } : {}),
      };

      const overwriteNote =
        overwroteTrashedTo !== undefined
          ? ` (replaced existing file, trashed to ${overwroteTrashedTo})`
          : "";
      return okResult<MoveFileData>(
        `Moved ${validatedArguments.fromPath} → ${validatedArguments.toPath} (sha256 ${afterSha256})${overwriteNote}`,
        { data },
      );
    },
  });
}
