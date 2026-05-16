import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { SandboxViolationError } from "../../../errors";
import { defineTool } from "../../define/define-tool";
import {
  applyBom,
  applyNewline,
  createMemoryAuditSink,
  detectNewline,
  hasBom,
  STALE_FILE_RECOVERY_HINT,
  sandboxErrorToToolError,
  sha256OfBuffer,
  stripBom,
  toLF,
  unifiedDiff,
  writeAtomic,
} from "../../io";
import type { AuditEntry, AuditSink } from "../../io/audit";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import type { WriteFileData, WriteFileToolConfig } from "./write-file.types";

const writeFileParams = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      "Workspace-relative path of the file to replace. Absolute paths are rejected unless " +
        "the sandbox is configured with `allowAbsolutePaths: true`.",
    ),
  content: z
    .string()
    .describe(
      "Full UTF-8 replacement content. Provide logical content with LF newlines and no BOM; " +
        "the tool re-applies the file's existing newline style and BOM on write.",
    ),
  expectedSha256: z
    .string()
    .length(64)
    .regex(
      /^[0-9a-f]{64}$/,
      "expectedSha256 must be a 64-character lowercase hex string",
    )
    .describe(
      "SHA-256 of the file's current on-disk bytes, as returned by `read_file`. " +
        "Required to detect concurrent edits — a mismatch yields `stale_file`.",
    ),
});

export function createWriteFileTool(
  config?: WriteFileToolConfig,
): ToolDefinition<typeof writeFileParams, WriteFileData> {
  const defaultSink = config?.defaultAuditSink;

  return defineTool<typeof writeFileParams, WriteFileData>({
    description: describeTool({
      purpose:
        "Replace the contents of an existing file. The sha256 from a prior `read_file` must be passed as `expectedSha256` so concurrent edits are detected.",
      inputs: [
        {
          name: "path",
          type: "string",
          required: true,
          description:
            "Workspace-relative path to the file. Must already exist.",
        },
        {
          name: "content",
          type: "string",
          required: true,
          description:
            "New UTF-8 content. The file's existing newline style and BOM are preserved automatically — pass plain LF text.",
        },
        {
          name: "expectedSha256",
          type: "string",
          required: true,
          description:
            "sha256 of the file as last read. Mismatch returns `stale_file` with the current hash in `error.details`.",
        },
      ],
      outputs:
        "`{ beforeSha256, afterSha256, diff }`. `afterSha256` is the new on-disk hash for use as `expectedSha256` next time.",
      errors: [
        {
          kind: "not_found",
          description: "File does not exist — use `create_file` instead.",
        },
        {
          kind: "stale_file",
          description:
            "`expectedSha256` does not match the current on-disk hash. Re-read and retry.",
        },
        {
          kind: "binary_file",
          description:
            "Existing file is binary — use `apply_patch` or a binary-aware workflow.",
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
        "Atomic write: staged to a sibling tmp file, fsync'd, then renamed.",
        "Parent directories are NOT created — use `create_file` with `createParentDirectories: true` for new paths.",
        "Every write is appended to the audit log as an `update` operation.",
      ],
    }),
    parameters: writeFileParams,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort, agentName, sessionId } = toolContext;
      const sink = toolContext.auditSink ?? defaultSink ?? createMemoryAuditSink();

      if (toolContext.abort.aborted) {
        return errorResult<WriteFileData>(
          toolError("command_failed", "Operation aborted before start.", {
            recoverable: false,
          }),
        );
      }

      let absolutePath: string;
      try {
        absolutePath = await guard.authorize(
          { type: "fs.write", resource: validatedArguments.path },
          { agentName, toolName: "write_file", signal: abort },
        );
      } catch (caught) {
        if (caught instanceof SandboxViolationError) {
          return errorResult<WriteFileData>(
            sandboxErrorToToolError(caught),
          );
        }
        throw caught;
      }

      let targetStat: Awaited<ReturnType<typeof stat>>;
      try {
        targetStat = await stat(absolutePath);
      } catch (statError) {
        const code = (statError as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
          return errorResult<WriteFileData>(
            toolError(
              "not_found",
              `File does not exist: ${validatedArguments.path}`,
              {
                path: validatedArguments.path,
                recoverable: true,
                suggestedNextAction:
                  "Use create_file (optionally with `createParentDirectories: true`) to create a new file.",
              },
            ),
          );
        }
        throw statError;
      }
      if (targetStat.isDirectory()) {
        return errorResult<WriteFileData>(
          toolError(
            "not_found",
            `Path is a directory, not a file: ${validatedArguments.path}`,
            {
              path: validatedArguments.path,
              recoverable: false,
            },
          ),
        );
      }

      const beforeBytes = await readFile(absolutePath);
      const beforeSha256 = sha256OfBuffer(beforeBytes);

      if (beforeSha256 !== validatedArguments.expectedSha256) {
        return errorResult<WriteFileData>(
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

      const beforeText = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
        beforeBytes,
      );
      const newlineStyle = detectNewline(beforeText);
      const hadBom = hasBom(beforeText);

      const logicalContent = stripBom(toLF(validatedArguments.content));
      const finalText = applyBom(
        applyNewline(logicalContent, newlineStyle),
        hadBom,
      );
      const finalBytes = new TextEncoder().encode(finalText);
      const afterSha256 = sha256OfBuffer(finalBytes);

      const diff = unifiedDiff(stripBom(toLF(beforeText)), logicalContent, {
        path: validatedArguments.path,
      });

      const auditBase: Omit<AuditEntry, "success"> = {
        timestamp: new Date().toISOString(),
        ...(sessionId !== undefined ? { sessionId } : {}),
        agentName,
        toolName: "write_file",
        operation: "update",
        path: validatedArguments.path,
        beforeSha256,
        afterSha256,
        diff,
      };

      try {
        await writeAtomic(absolutePath, finalBytes);
      } catch (writeError) {
        const message = (writeError as Error).message;
        try {
          await sink.append({ ...auditBase, success: false, error: message });
        } catch {
          /* ignore */
        }
        return errorResult<WriteFileData>(
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

      try {
        await sink.append({ ...auditBase, success: true });
      } catch {
        /* audit failures are non-fatal */
      }

      const data: WriteFileData = {
        path: validatedArguments.path,
        beforeSha256,
        afterSha256,
        sizeBytes: finalBytes.byteLength,
        diff,
      };

      const unchanged = beforeSha256 === afterSha256;
      const output = unchanged
        ? `No change to ${validatedArguments.path} (content matched existing)`
        : `Wrote ${validatedArguments.path} (${finalBytes.byteLength} bytes, sha256 ${afterSha256})`;
      return okResult<WriteFileData>(output, { data });
    },
  });
}
