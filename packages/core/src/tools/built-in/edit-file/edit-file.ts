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
  isLikelyBinary,
  STALE_FILE_RECOVERY_HINT,
  sandboxErrorToToolError,
  sha256OfBuffer,
  stripBom,
  toLF,
  unifiedDiff,
  writeAtomic,
} from "../../io";
import type { AuditEntry } from "../../io/audit";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import type {
  AppliedEdit,
  EditFileData,
  EditFileToolConfig,
  MatchRange,
} from "./edit-file.types";
import {
  applyReplacements,
  detectOverlappingEdits,
  locateEditOccurrences,
} from "./edit-file.utils";

const editSchema = z.object({
  oldText: z
    .string()
    .min(1)
    .describe(
      "Exact substring to match in the current file content. Matching is literal " +
        "(no regex). Compared against logical (LF, no-BOM) content — provide LF newlines.",
    ),
  newText: z
    .string()
    .describe(
      "Replacement text. May be empty to delete the matched range. Provide LF newlines; " +
        "the tool re-applies the file's existing newline style and BOM on write.",
    ),
  expectedOccurrences: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Expected number of matches for `oldText` (default 1). Any other count yields " +
        "`multiple_matches` with the actual match ranges in `error.details`.",
    ),
});

export const editFileParams = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      "Workspace-relative path of the file to edit. Absolute paths are rejected unless " +
        "the sandbox is configured with `allowAbsolutePaths: true`.",
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
  edits: z
    .array(editSchema)
    .min(1)
    .describe(
      "One or more (oldText, newText) replacements. All edits are evaluated against the " +
        "ORIGINAL file snapshot, so order is irrelevant and overlapping replacements " +
        "are reported as `overlapping_edits` rather than silently clobbering each other.",
    ),
});

/**
 * Create the `edit_file` tool.
 *
 * @param config - Optional configuration overriding the default audit sink.
 * @example
 * ```ts
 * const editFile = createEditFileTool();
 * ```
 */
export function createEditFileTool(
  config?: EditFileToolConfig,
): ToolDefinition<typeof editFileParams, EditFileData> {
  const defaultSink = config?.defaultAuditSink;

  return defineTool<typeof editFileParams, EditFileData>({
    description: describeTool({
      purpose: [
        "Apply one or more exact-string replacements to a text file in a single transaction.",
        "All edits are matched against the ORIGINAL file snapshot, so edit order is irrelevant and earlier edits never create or hide matches for later edits.",
      ],
      inputs: [
        {
          name: "path",
          type: "string",
          required: true,
          description: "Workspace-relative path to an existing text file.",
        },
        {
          name: "expectedSha256",
          type: "string",
          required: true,
          description:
            "sha256 of the file as last read. Mismatch returns `stale_file`.",
        },
        {
          name: "edits",
          type: "Array<{ oldText, newText, expectedOccurrences? }>",
          required: true,
          description:
            "One or more replacement specs. `expectedOccurrences` defaults to 1 — any mismatch (zero or more than expected) is reported as a structured error rather than guessed.",
        },
      ],
      outputs:
        "`{ beforeSha256, afterSha256, appliedEdits: [{ editIndex, occurrences }], diff }`. `afterSha256` is the new on-disk hash.",
      errors: [
        { kind: "not_found", description: "File does not exist." },
        {
          kind: "binary_file",
          description:
            "Existing file is binary — use `apply_patch` for binary-adjacent workflows.",
        },
        {
          kind: "stale_file",
          description:
            "`expectedSha256` does not match the current hash. Re-read and retry.",
        },
        {
          kind: "old_text_not_found",
          description:
            "`edits[i].oldText` has zero matches. `error.details.editIndex` identifies which one.",
        },
        {
          kind: "multiple_matches",
          description:
            "Match count does not equal `expectedOccurrences`. `error.details.matchRanges: [{ startLine, endLine }]` lists every match so you can narrow `oldText` or raise `expectedOccurrences`.",
        },
        {
          kind: "overlapping_edits",
          description:
            "Two edits replace intersecting byte ranges in the original snapshot. `error.details.conflictingEditIndices` identifies the pair.",
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
      examples: [
        '{"path":"a.ts","expectedSha256":"…","edits":[{"oldText":"foo","newText":"bar"}]} — single replacement, must match exactly once.',
        '{"path":"a.ts","expectedSha256":"…","edits":[{"oldText":"foo","newText":"bar","expectedOccurrences":3}]} — replace every of three known matches.',
      ],
      notes: [
        "Atomic write: staged to a sibling tmp file, fsync'd, then renamed.",
        "Newline style and BOM of the existing file are preserved.",
        "Every successful run is appended to the audit log as an `update` operation.",
      ],
    }),
    parameters: editFileParams,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort, agentName, sessionId } = toolContext;
      const sink = toolContext.auditSink ?? defaultSink ?? createMemoryAuditSink();

      if (toolContext.abort.aborted) {
        return errorResult<EditFileData>(
          toolError("command_failed", "Operation aborted before start.", {
            recoverable: false,
          }),
        );
      }

      let absolutePath: string;
      try {
        absolutePath = await guard.authorize(
          { type: "fs.write", resource: validatedArguments.path },
          { agentName, toolName: "edit_file", signal: abort },
        );
      } catch (caught) {
        if (caught instanceof SandboxViolationError) {
          return errorResult<EditFileData>(
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
          return errorResult<EditFileData>(
            toolError(
              "not_found",
              `File does not exist: ${validatedArguments.path}`,
              {
                path: validatedArguments.path,
                recoverable: true,
                suggestedNextAction:
                  "Use create_file to create a new file, or verify the path.",
              },
            ),
          );
        }
        throw statError;
      }
      if (targetStat.isDirectory()) {
        return errorResult<EditFileData>(
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
      if (isLikelyBinary(beforeBytes)) {
        return errorResult<EditFileData>(
          toolError(
            "binary_file",
            `Cannot edit binary file: ${validatedArguments.path}`,
            {
              path: validatedArguments.path,
              recoverable: false,
              suggestedNextAction:
                "Use apply_patch or write_file with binary-aware tooling instead of edit_file.",
            },
          ),
        );
      }

      const beforeSha256 = sha256OfBuffer(beforeBytes);
      if (beforeSha256 !== validatedArguments.expectedSha256) {
        return errorResult<EditFileData>(
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

      const beforeRaw = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
        beforeBytes,
      );
      const newlineStyle = detectNewline(beforeRaw);
      const hadBom = hasBom(beforeRaw);
      const snapshot = stripBom(toLF(beforeRaw));

      const result = locateEditOccurrences(
        snapshot,
        validatedArguments.edits,
        validatedArguments.path,
      );

      if ("errorKind" in result) {
        const kind = result.errorKind as
          | "old_text_not_found"
          | "multiple_matches";
        return errorResult<EditFileData>(
          toolError(kind, result.errorMessage, {
            path: validatedArguments.path,
            recoverable: true,
            suggestedNextAction:
              kind === "old_text_not_found"
                ? "Re-read the file to confirm current content and adjust `oldText`."
                : "Either widen `oldText` to make it unique, or set `expectedOccurrences` to the actual count.",
            details: result.errorDetails,
          }),
        );
      }

      const { planned, appliedEdits } = result;

      const conflicting = detectOverlappingEdits(planned);
      if (conflicting) {
        return errorResult<EditFileData>(
          toolError(
            "overlapping_edits",
            `Edits ${conflicting.join(", ")} target overlapping ranges in ${validatedArguments.path}.`,
            {
              path: validatedArguments.path,
              recoverable: true,
              suggestedNextAction:
                "Split or rewrite the edits so their oldText regions don't intersect.",
              details: { conflictingEditIndices: conflicting },
            },
          ),
        );
      }

      const working = applyReplacements(snapshot, planned);

      const finalText = applyBom(applyNewline(working, newlineStyle), hadBom);
      const finalBytes = new TextEncoder().encode(finalText);
      const afterSha256 = sha256OfBuffer(finalBytes);
      const diff = unifiedDiff(snapshot, working, {
        path: validatedArguments.path,
      });

      const auditBase: Omit<AuditEntry, "success"> = {
        timestamp: new Date().toISOString(),
        ...(sessionId !== undefined ? { sessionId } : {}),
        agentName,
        toolName: "edit_file",
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
        return errorResult<EditFileData>(
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

      const data: EditFileData = {
        path: validatedArguments.path,
        beforeSha256,
        afterSha256,
        sizeBytes: finalBytes.byteLength,
        appliedEdits,
        diff,
      };

      const unchanged = beforeSha256 === afterSha256;
      const totalOccurrences = appliedEdits.reduce(
        (sum, edit) => sum + edit.occurrences,
        0,
      );
      const output = unchanged
        ? `No change to ${validatedArguments.path} (all edits matched existing content)`
        : `Edited ${validatedArguments.path} (${validatedArguments.edits.length} edit(s), ${totalOccurrences} replacement(s), sha256 ${afterSha256})`;
      return okResult<EditFileData>(output, { data });
    },
  });
}
