import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { SandboxViolationError } from "../../../errors";
import { defineTool } from "../../define/define-tool";
import {
  applyBom,
  applyNewline,
  buildAuditBase,
  createMemoryAuditSink,
  detectNewline,
  hasBom,
  isLikelyBinary,
  logAuditFailure,
  logAuditSuccess,
  sandboxErrorToToolError,
  sha256OfBuffer,
  STALE_FILE_RECOVERY_HINT,
  stripBom,
  toLF,
  unifiedDiff,
  writeAtomic,
} from "../../io";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import type { EditFileData, EditFileToolConfig } from "./edit-file.types";
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
    .optional()
    .describe(
      "Optional. SHA-256 of the file's current on-disk bytes, as returned by `read_file`. " +
        "When present, a mismatch yields `stale_file` so concurrent edits are caught. " +
        "When omitted, the tool reads the file at edit time and proceeds without staleness " +
        "protection — fine for typical single-agent runs.",
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
          required: false,
          description:
            "Optional. sha256 of the file as last read. When present, a mismatch returns `stale_file`. When omitted, the tool reads the file at edit time without staleness protection (typical single-agent workflow).",
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
    systemPrompt: `### Using edit_file

\`edit_file\` is the **preferred** tool for changing existing files. Surgical, atomic, and forgiving of trivial whitespace drift.

**Required arguments — every call must include all of these:**

- \`path\`: workspace-relative file path (e.g. \`"src/App.tsx"\`).
- \`edits\`: an **array** of at least one \`{ oldText, newText, expectedOccurrences? }\` object. Each edit must have a non-empty \`oldText\` (the string to find) and a \`newText\` (the replacement; may be \`""\` to delete). Calling with \`edits: []\` or \`edits: [{ newText: "..." }]\` (missing \`oldText\`) is invalid and the tool will reject the call with an explicit error.

**Optional:**

- \`expectedSha256\`: a 64-char lowercase hex hash from a prior \`read_file\` / \`edit_file\`. When set, the tool refuses the edit if the file changed under you (\`stale_file\` error). When omitted, the tool reads the file fresh at edit time and proceeds — fine for typical single-agent workflows.

**How matching works (the helpful part):**

The tool tries \`oldText\` against the file in this order:

1. **Exact substring** — character-for-character match, including whitespace.
2. **Line-trimmed** — same lines, possibly different leading/trailing whitespace per line. Catches typical indent drift.
3. **Whitespace-normalized** (single-line only) — all whitespace runs collapsed.
4. **Block anchor** (≥3 lines) — first and last lines (trimmed) match an unambiguous block in the file; middle is allowed to differ.

The first strategy to produce a **unique** match wins. The result tells you which one was used (\`usedFallback: true\`, \`replacerName: ...\`) so you can tighten \`oldText\` next time if you want the strict path.

**Read first, then edit:**

You don't *need* \`expectedSha256\`, but you DO need to know what's in the file. Call \`read_file\` before any edit. The exact \`oldText\` should come from what you read — copying real lines is the most reliable way to get a unique match.

**When to use \`write_file\` instead:** when more than ~60% of the file is changing. For everything else, \`edit_file\` is correct.

**Post-edit verification (MANDATORY):**

After every successful \`edit_file\` call, **run the project's configured verifier on the affected file(s) using \`run_command\`** before moving to your next task. The most common silent regressions are:

- **Typos** in identifiers — flagged as "Cannot find name 'X'" or "'Y' is declared but never used".
- **Broken imports** — wrong path, missing extension, removed export.
- **Unused imports** left over from the edit.
- **Type errors** introduced by changed signatures or refactored shapes.

**If the verifier reports anything — even one warning — fix it with another \`edit_file\` call before reporting.** Do not assume an edit is good just because it looked right; the project's verifier is the only ground truth.

**Never** call \`edit_file\` without first reading the file. **Never** pass an empty \`edits\` array. **Never** end your turn with unaddressed verifier failures caused by your edits.`,
    parameters: editFileParams,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort, agentName } = toolContext;
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
          return errorResult<EditFileData>(sandboxErrorToToolError(caught));
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
      // `expectedSha256` is optional. When the LLM provides it, we
      // enforce staleness protection (concurrent edits would yield a
      // hash mismatch). When omitted — the more common single-agent
      // workflow, mirroring OpenCode's edit tool — we read the file
      // fresh inside this call and proceed without the chain. Either
      // way, `afterSha256` is returned in the result so the caller can
      // opt into the chain on subsequent edits if they want.
      if (
        validatedArguments.expectedSha256 !== undefined &&
        beforeSha256 !== validatedArguments.expectedSha256
      ) {
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

      const auditBase = buildAuditBase(toolContext, "edit_file", "update", validatedArguments.path, {
        beforeSha256,
        afterSha256,
        diff,
      });

      try {
        await writeAtomic(absolutePath, finalBytes);
      } catch (writeError) {
        const message = (writeError as Error).message;
        await logAuditFailure(sink, auditBase, message);
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

      await logAuditSuccess(sink, auditBase);

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
