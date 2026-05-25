import { readFile, stat, unlink } from "node:fs/promises";
import { SandboxViolationError } from "../../../errors";
import { defineTool } from "../../define/define-tool";
import {
  createMemoryAuditSink,
  moveToTrash,
  STALE_FILE_RECOVERY_HINT,
  sandboxErrorToToolError,
  sha256OfBuffer,
  unifiedDiff,
} from "../../io";
import type { AuditEntry } from "../../io/audit";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import { deleteFileParams } from "./delete-file.constants";
import type { DeleteFileData, DeleteFileToolConfig } from "./delete-file.types";

/** Create the `delete_file` tool. */
export function createDeleteFileTool(
  config?: DeleteFileToolConfig,
): ToolDefinition<typeof deleteFileParams, DeleteFileData> {
  const defaultSink = config?.defaultAuditSink;

  return defineTool<typeof deleteFileParams, DeleteFileData>({
    description: describeTool({
      purpose:
        "Delete a workspace file. By default the file is moved to a workspace-scoped trash bucket so it can be recovered.",
      inputs: [
        {
          name: "path",
          type: "string",
          required: true,
          description:
            "Workspace-relative path to a regular file. Directories are not deletable through this tool.",
        },
        {
          name: "expectedSha256",
          type: "string",
          required: true,
          description:
            "sha256 of the file as last read. Mismatch returns `stale_file`.",
        },
        {
          name: "permanent",
          type: "boolean",
          required: false,
          defaultValue: "false",
          description:
            "Unlink directly without going through the trash. Not recoverable.",
        },
      ],
      outputs:
        "`{ deleted: true, beforeSha256, diff, trashedTo? }`. `trashedTo` is set when the file went through the trash; `diff` is the unified diff from the file to `/dev/null`.",
      errors: [
        {
          kind: "not_found",
          description: "File does not exist or is a directory.",
        },
        {
          kind: "stale_file",
          description:
            "`expectedSha256` does not match the current hash. Re-read and retry.",
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
        "Trash lives under `<dataDir>/trash/<sha256(workspaceRoot)>/<timestamp>-<sessionId>-<runId>-<basename>.tar.gz`. Archives are user-managed via the daemon (no automatic GC).",
        "Every delete is appended to the audit log as a `delete` operation.",
      ],
    }),
    systemPrompt: `### Using delete_file

\`delete_file\` moves a file to the workspace trash. **Recoverable** with \`restore_file\` — this is a soft delete, not a hard \`rm\`.

**Required:**

- \`path\`: workspace-relative path of the file to delete.

**Useful optional:**

- \`expectedSha256\`: when set, must match the file's current hash. Use this if you read the file recently and want staleness protection against concurrent modification.

The result includes a \`trashId\` you can pass to \`restore_file\` to undo the deletion within the same workspace.

**Pre-delete check + post-delete verification (MANDATORY):**

Before deleting, \`search_files\` for references to the file you're about to delete — if anything imports it, deleting will break that import.

After every successful \`delete_file\` call, **run the project's type-checker with \`run_command\`** (e.g. \`tsc --noEmit\`) to confirm no surviving file still imports the deleted one. If the verifier reports broken imports, either fix the importers (\`edit_file\` to remove the references) or \`restore_file\` to undo the delete.

**Never** end your turn with broken imports caused by a delete.`,
    parameters: deleteFileParams,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort, agentName, sessionId } = toolContext;
      const sink =
        toolContext.auditSink ?? defaultSink ?? createMemoryAuditSink();

      if (abort.aborted) {
        return errorResult<DeleteFileData>(
          toolError("command_failed", "Operation aborted before start.", {
            recoverable: false,
          }),
        );
      }

      let absolutePath: string;
      try {
        absolutePath = await guard.authorize(
          { type: "fs.write", resource: validatedArguments.path },
          { agentName, toolName: "delete_file", signal: abort },
        );
      } catch (caught) {
        if (caught instanceof SandboxViolationError) {
          return errorResult<DeleteFileData>(sandboxErrorToToolError(caught));
        }
        throw caught;
      }

      let targetStat: Awaited<ReturnType<typeof stat>>;
      try {
        targetStat = await stat(absolutePath);
      } catch (statError) {
        const code = (statError as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
          return errorResult<DeleteFileData>(
            toolError(
              "not_found",
              `File does not exist: ${validatedArguments.path}`,
              {
                path: validatedArguments.path,
                recoverable: false,
              },
            ),
          );
        }
        throw statError;
      }
      if (targetStat.isDirectory()) {
        return errorResult<DeleteFileData>(
          toolError(
            "not_found",
            `Path is a directory, not a file: ${validatedArguments.path}`,
            { path: validatedArguments.path, recoverable: false },
          ),
        );
      }

      const beforeBytes = await readFile(absolutePath);
      const beforeSha256 = sha256OfBuffer(beforeBytes);
      if (beforeSha256 !== validatedArguments.expectedSha256) {
        return errorResult<DeleteFileData>(
          toolError(
            "stale_file",
            `File has changed since last read: ${validatedArguments.path}`,
            {
              path: validatedArguments.path,
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

      // Compute a "file → /dev/null" diff over a decoded UTF-8 view of
      // the content. Binary deletes still produce a (possibly noisy)
      // diff — operators can ignore the body and rely on the audit
      // entry's beforeSha256 + trashedTo.
      const beforeText = new TextDecoder("utf-8", { fatal: false }).decode(
        beforeBytes,
      );
      const diff = unifiedDiff(beforeText, "", {
        path: validatedArguments.path,
      });
      const permanent = validatedArguments.permanent === true;

      let trashedTo: string | undefined;
      try {
        if (permanent) {
          await unlink(absolutePath);
        } else {
          trashedTo = await moveToTrash(guard.cwd, absolutePath, {
            sessionId,
            agentName,
            ...guard.trashMetadata,
          });
        }
      } catch (caughtError) {
        const message = (caughtError as Error).message;
        const failureBase: Omit<AuditEntry, "success"> = {
          timestamp: new Date().toISOString(),
          ...(sessionId !== undefined ? { sessionId } : {}),
          agentName,
          toolName: "delete_file",
          operation: "delete",
          path: validatedArguments.path,
          beforeSha256,
          diff,
          details: { permanent },
        };
        try {
          await sink.append({ ...failureBase, success: false, error: message });
        } catch {
          /* ignore */
        }
        return errorResult<DeleteFileData>(
          toolError(
            "command_failed",
            `Failed to delete ${validatedArguments.path}: ${message}`,
            {
              path: validatedArguments.path,
              recoverable: false,
            },
          ),
        );
      }

      const auditEntry: AuditEntry = {
        timestamp: new Date().toISOString(),
        ...(sessionId !== undefined ? { sessionId } : {}),
        agentName,
        toolName: "delete_file",
        operation: "delete",
        path: validatedArguments.path,
        beforeSha256,
        diff,
        success: true,
        details: {
          permanent,
          ...(trashedTo !== undefined ? { trashedTo } : {}),
        },
      };
      try {
        await sink.append(auditEntry);
      } catch {
        /* audit failures are non-fatal */
      }

      const data: DeleteFileData = {
        deleted: true,
        path: validatedArguments.path,
        beforeSha256,
        sizeBytes: beforeBytes.byteLength,
        diff,
        permanent,
        ...(trashedTo !== undefined ? { trashedTo } : {}),
      };

      const output = permanent
        ? `Permanently deleted ${validatedArguments.path} (${beforeBytes.byteLength} bytes, sha256 ${beforeSha256})`
        : `Deleted ${validatedArguments.path} (${beforeBytes.byteLength} bytes, trashed to ${trashedTo})`;
      return okResult<DeleteFileData>(output, { data });
    },
  });
}
