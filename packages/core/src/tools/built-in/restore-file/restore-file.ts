import { stat } from "node:fs/promises";
import { z } from "zod";
import { defineTool } from "../../define/define-tool";
import { restoreFromTrash } from "../../io";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import type { RestoreFileData } from "./restore-file.types";

const restoreFileParams = z.object({
  trashedPath: z
    .string()
    .min(1)
    .describe(
      "Absolute path to the .tar.gz trash archive. Obtain from a previous `delete_file` " +
        "result's `trashedTo` field or from the audit log.",
    ),
  targetPath: z
    .string()
    .optional()
    .describe(
      "Optional workspace-relative path for the restored file. If omitted, the file is " +
        "restored to its original path (as recorded in the archive's metadata).",
    ),
});

/** Create the `restore_file` tool. */
export function createRestoreFileTool(): ToolDefinition<
  typeof restoreFileParams,
  RestoreFileData
> {
  return defineTool<typeof restoreFileParams, RestoreFileData>({
    description: describeTool({
      purpose:
        "Restore a previously trashed file from its .tar.gz trash archive. The file is extracted and placed at its original workspace-relative path (or an optional override).",
      inputs: [
        {
          name: "trashedPath",
          type: "string",
          required: true,
          description:
            "Absolute path to the .tar.gz trash archive (from delete_file result or audit log).",
        },
        {
          name: "targetPath",
          type: "string",
          required: false,
          description:
            "Optional workspace-relative override for the restore location. Defaults to the original path.",
        },
      ],
      outputs:
        "`{ restored: true, path, from, sizeBytes }` where `path` is the workspace-relative restore location and `from` is the trash archive path.",
      errors: [
        {
          kind: "not_found",
          description:
            "The trash archive does not exist or its metadata is corrupted.",
        },
        {
          kind: "already_exists",
          description:
            "A file already exists at the restore target path. Use `delete_file` first.",
        },
        {
          kind: "outside_workspace",
          description:
            "The restore target path escapes the sandbox root or is absolute when not allowed.",
        },
        {
          kind: "permission_denied",
          description:
            "The restore target is write-blocked by the sandbox or matches a forbidden glob.",
        },
      ],
      notes: [
        "The trash archive is removed from the trash directory after a successful restore.",
        "If `targetPath` is omitted, the file is restored to the original path recorded in the archive.",
      ],
    }),
    parameters: restoreFileParams,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort } = toolContext;

      if (abort.aborted) {
        return errorResult<RestoreFileData>(
          toolError("command_failed", "Operation aborted before start.", {
            recoverable: false,
          }),
        );
      }

      try {
        await stat(validatedArguments.trashedPath);
      } catch {
        return errorResult<RestoreFileData>(
          toolError(
            "not_found",
            `Trash archive not found: ${validatedArguments.trashedPath}`,
            { path: validatedArguments.trashedPath, recoverable: false },
          ),
        );
      }

      let restoredAbsolute: string;
      try {
        restoredAbsolute = await restoreFromTrash(
          guard.cwd,
          validatedArguments.trashedPath,
          validatedArguments.targetPath,
        );

        const contentStat = await stat(restoredAbsolute);
        const sizeBytes = contentStat.size;

        return okResult<RestoreFileData>(
          `Restored ${validatedArguments.trashedPath} to ${restoredAbsolute} (${sizeBytes} bytes)`,
          {
            data: {
              restored: true,
              path:
                validatedArguments.targetPath ??
                restoredAbsolute.slice(guard.cwd.length + 1),
              from: validatedArguments.trashedPath,
              sizeBytes,
            },
          },
        );
      } catch (caughtError) {
        const message = (caughtError as Error).message;
        return errorResult<RestoreFileData>(
          toolError(
            "command_failed",
            `Failed to restore from ${validatedArguments.trashedPath}: ${message}`,
            {
              path: validatedArguments.trashedPath,
              recoverable: false,
            },
          ),
        );
      }
    },
  });
}
