import { z } from "zod";
import { SandboxViolationError } from "../../../errors";
import { defineTool } from "../../define/define-tool";
import { createMemoryAuditSink, sandboxErrorToToolError } from "../../io";
import { errorResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import type {
  ApplyPatchData,
  ApplyPatchToolConfig,
  PatchPlan,
} from "./apply-patch.types";
import {
  buildAuditAndResult,
  CommitFailedError,
  commitStagedFiles,
  DryRunError,
  dryRunPatch,
  PatchParseError,
  parsePatchEnvelope,
  type StagedFile,
  writeAuditFailure,
} from "./apply-patch.utils";

const applyPatchParams = z.object({
  patch: z
    .string()
    .min(1)
    .describe(
      "The patch envelope. Must start with `*** Begin Patch` and end with `*** End Patch`. " +
        "See `docs/patch-envelope.md` for the full grammar (Add / Update / Delete / Move).",
    ),
  expectedSha256ByPath: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Optional map of workspace-relative path → expected pre-image sha256. Paths not in the " +
        'map skip the stale-check. For `Add File` use the empty string `""` as a sentinel to ' +
        "assert the file does not yet exist.",
    ),
  atomic: z
    .boolean()
    .optional()
    .describe(
      "When true (default) the whole patch commits atomically: any failure rolls back all " +
        "already-applied files to their pre-images. When false the tool applies sequentially " +
        "and stops on first error, leaving partial state on disk.",
    ),
});

/** Create the `apply_patch` tool. */
export function createApplyPatchTool(
  config?: ApplyPatchToolConfig,
): ToolDefinition<typeof applyPatchParams, ApplyPatchData> {
  const defaultSink = config?.defaultAuditSink;

  return defineTool<typeof applyPatchParams, ApplyPatchData>({
    description: describeTool({
      purpose: [
        "Apply a multi-file patch in the OpenAI `apply_patch` v2 envelope format. A single call can Add, Update, Delete, and Move files together.",
        "By default the whole patch is atomic: every change is staged, then committed by rename; any failure rolls back the files already committed.",
      ],
      inputs: [
        {
          name: "patch",
          type: "string",
          required: true,
          description:
            "Patch text bounded by `*** Begin Patch` / `*** End Patch`. See `docs/patch-envelope.md` for the grammar and worked examples.",
        },
        {
          name: "expectedSha256ByPath",
          type: "object<string, string>",
          required: false,
          description:
            "Map of path → expected sha256 for Update / Delete / Move sources. Any mismatch fails the whole patch with `stale_file`.",
        },
        {
          name: "atomic",
          type: "boolean",
          required: false,
          defaultValue: "true",
          description:
            "When `true`, no on-disk state changes until every hunk validates and stages cleanly. When `false`, files are applied sequentially and a failure leaves earlier changes in place.",
        },
      ],
      outputs:
        "`{ atomic, changedFiles: [{ path, operation, beforeSha256?, afterSha256?, diff }] }`. `operation` is one of `add` / `update` / `delete` / `move`. For move operations `path` is the source and `afterSha256` reflects the new location.",
      errors: [
        {
          kind: "patch_parse_error",
          description:
            "Patch text does not match the envelope grammar. `error.details: { line, expected }` points at the first offending line.",
        },
        {
          kind: "patch_apply_error",
          description:
            "A hunk could not be applied with zero fuzz. `error.details: { path, hunkIndex, reason }` localizes the failure.",
        },
        {
          kind: "stale_file",
          description:
            "An `expectedSha256ByPath` entry does not match the current on-disk hash.",
        },
        {
          kind: "not_found",
          description: "An Update / Delete / Move source file is missing.",
        },
        {
          kind: "already_exists",
          description: "An Add or Move destination already exists.",
        },
        {
          kind: "outside_workspace",
          description: "A patched path escapes the sandbox root.",
        },
        {
          kind: "permission_denied",
          description:
            "A patched path is blocked by the sandbox or matches a forbidden glob.",
        },
      ],
      notes: [
        "Each changed file is appended to the audit log with the matching operation kind.",
        "`apply_patch` is the preferred tool for any change touching more than one file — it gives atomicity that sequential `write_file` / `edit_file` calls can't.",
      ],
    }),
    parameters: applyPatchParams,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort, agentName, sessionId } = toolContext;
      const sink =
        toolContext.auditSink ?? defaultSink ?? createMemoryAuditSink();
      const atomic = validatedArguments.atomic ?? true;

      if (abort.aborted) {
        return errorResult<ApplyPatchData>(
          toolError("command_failed", "Operation aborted before start.", {
            recoverable: false,
          }),
        );
      }

      let plan: PatchPlan;
      try {
        plan = parsePatchEnvelope(validatedArguments.patch);
      } catch (caughtError) {
        if (caughtError instanceof PatchParseError) {
          return errorResult<ApplyPatchData>(
            toolError("patch_parse_error", caughtError.message, {
              recoverable: false,
              details: {
                line: caughtError.line,
                expected: caughtError.expected,
              },
            }),
          );
        }
        throw caughtError;
      }

      const resolved = new Map<string, string>();
      for (const operation of plan.operations) {
        const pathsToResolve =
          operation.kind === "move"
            ? [operation.fromPath, operation.toPath]
            : [operation.path];
        for (const candidatePath of pathsToResolve) {
          if (resolved.has(candidatePath)) continue;
          try {
            resolved.set(
              candidatePath,
              await guard.authorize(
                { type: "fs.write", resource: candidatePath },
                { agentName, toolName: "apply_patch", signal: abort },
              ),
            );
          } catch (caughtError) {
            if (caughtError instanceof SandboxViolationError) {
              return errorResult<ApplyPatchData>(
                sandboxErrorToToolError(caughtError),
              );
            }
            throw caughtError;
          }
        }
      }

      let stagedFiles: StagedFile[];
      try {
        stagedFiles = await dryRunPatch(
          plan,
          resolved,
          validatedArguments.expectedSha256ByPath,
        );
      } catch (caughtError) {
        if (caughtError instanceof DryRunError) {
          return errorResult<ApplyPatchData>(caughtError.toToolError());
        }
        throw caughtError;
      }

      try {
        await commitStagedFiles(stagedFiles, guard.cwd, {
          atomic,
          trashMetadata: {
            ...(sessionId !== undefined ? { sessionId } : {}),
            agentName,
            ...guard.trashMetadata,
          },
        });
      } catch (caughtError) {
        if (!(caughtError instanceof CommitFailedError)) throw caughtError;

        await writeAuditFailure({
          sink,
          sessionId,
          agentName,
          atomic,
          plan,
          stagedFiles,
          committedFiles: caughtError.committedFiles,
          message: caughtError.message,
        });
        return errorResult<ApplyPatchData>(
          toolError(
            "patch_apply_error",
            `Patch commit failed: ${caughtError.message}`,
            {
              recoverable: false,
              details: {
                atomic,
                committed: caughtError.committedFiles.length,
              },
            },
          ),
        );
      }

      return buildAuditAndResult({
        plan,
        stagedFiles,
        atomic,
        sink,
        sessionId,
        agentName,
      });
    },
  });
}
