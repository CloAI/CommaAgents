import { randomBytes } from "node:crypto";
import {
  copyFile,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
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
  unifiedDiff,
} from "../../io";
import type { AuditEntry, AuditSink } from "../../io/audit.types";
import type { TrashMetadata } from "../../io/trash";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import {
  PATCH_ADD_FILE_SENTINEL_SHA,
  PATCH_DEFAULT_DIFF_CONTEXT,
  PATCH_STAGING_SUFFIX,
} from "./apply-patch.constants";
import type {
  ApplyPatchChangedFile,
  ApplyPatchData,
  ApplyPatchToolConfig,
  PatchFileOperation,
  PatchPlan,
} from "./apply-patch.types";
import {
  applyUpdateHunks,
  formatChangedFileLine,
  PatchApplyError,
  PatchParseError,
  parsePatchEnvelope,
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

/**
 * Internal record describing a single staged write or scheduled delete
 * captured during the dry-run pass. Used during the commit pass to
 * execute and, on failure, to roll back.
 */
interface StagedFile {
  readonly operation: "add" | "update" | "delete" | "move";
  readonly path: string;
  readonly toPath?: string;
  readonly absolutePath: string;
  readonly absoluteToPath?: string;
  /** Pre-image bytes, captured before any disk write. `undefined` for pure-add. */
  readonly beforeBytes?: Buffer;
  /** Post-image bytes that should be on disk after commit. `undefined` for delete. */
  readonly afterBytes?: Buffer;
  readonly beforeSha256?: string;
  readonly afterSha256?: string;
  /** Path of the sibling temp file once {@link stageWrite} runs. */
  stagedTempPath?: string;
  /** Path the file was moved to in trash on commit, if applicable. */
  trashedTo?: string;
  /** Set to true after the destination file reflects `afterBytes`. */
  committed: boolean;
}

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
          } catch (caught) {
            if (caught instanceof SandboxViolationError) {
              return errorResult<ApplyPatchData>(
                sandboxErrorToToolError(caught),
              );
            }
            throw caught;
          }
        }
      }

      let stagedFiles: StagedFile[];
      try {
        stagedFiles = await dryRunPlan(
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

      const committedFiles: StagedFile[] = [];
      try {
        for (const staged of stagedFiles) {
          if (staged.afterBytes !== undefined) {
            const targetPath =
              staged.operation === "move"
                ? (staged.absoluteToPath as string)
                : staged.absolutePath;
            staged.stagedTempPath = await stageWrite(
              targetPath,
              staged.afterBytes,
            );
          }
        }

        for (const staged of stagedFiles) {
          await commitOne(staged, guard.cwd, {
            sessionId,
            agentName,
            ...guard.trashMetadata,
          });
          staged.committed = true;
          committedFiles.push(staged);
        }
      } catch (commitError) {
        if (atomic) {
          await rollback(committedFiles, stagedFiles);
        } else {
          await cleanupStagedTempFiles(stagedFiles);
        }
        const message = (commitError as Error).message;
        await writeAuditFailure({
          sink,
          sessionId,
          agentName,
          atomic,
          plan,
          stagedFiles,
          committedFiles,
          message,
        });
        return errorResult<ApplyPatchData>(
          toolError("patch_apply_error", `Patch commit failed: ${message}`, {
            recoverable: false,
            details: { atomic, committed: committedFiles.length },
          }),
        );
      }

      const changedFiles: ApplyPatchChangedFile[] = [];
      for (const staged of stagedFiles) {
        const diff = buildDiff(staged);
        const entry: ApplyPatchChangedFile = {
          path: staged.path,
          operation: staged.operation,
          ...(staged.toPath !== undefined ? { toPath: staged.toPath } : {}),
          ...(staged.beforeSha256 !== undefined
            ? { beforeSha256: staged.beforeSha256 }
            : {}),
          ...(staged.afterSha256 !== undefined
            ? { afterSha256: staged.afterSha256 }
            : {}),
          diff,
          ...(staged.trashedTo !== undefined
            ? { trashedTo: staged.trashedTo }
            : {}),
        };
        changedFiles.push(entry);

        try {
          await sink.append(
            buildAuditEntry({
              staged,
              diff,
              sessionId,
              agentName,
              success: true,
            }),
          );
        } catch {
          /* audit failures are non-fatal */
        }
      }

      const data: ApplyPatchData = {
        atomic,
        hunkCount: plan.hunkCount,
        changedFiles,
      };

      const summary =
        `Applied patch (${atomic ? "atomic" : "sequential"}): ` +
        `${changedFiles.length} file(s), ${plan.hunkCount} hunk(s).\n` +
        changedFiles.map((entry) => formatChangedFileLine(entry)).join("\n");

      return okResult<ApplyPatchData>(summary, { data });
    },
  });
}

class DryRunError extends Error {
  readonly toolError: ReturnType<typeof toolError>;
  constructor(toolErrorValue: ReturnType<typeof toolError>) {
    super(toolErrorValue.message);
    this.toolError = toolErrorValue;
  }
  toToolError() {
    return this.toolError;
  }
}

async function dryRunPlan(
  plan: PatchPlan,
  resolved: ReadonlyMap<string, string>,
  expectedShaMap: Readonly<Record<string, string>> | undefined,
): Promise<StagedFile[]> {
  const staged: StagedFile[] = [];
  const pathsTouched = new Set<string>();

  for (
    let operationIndex = 0;
    operationIndex < plan.operations.length;
    operationIndex++
  ) {
    const operation = plan.operations[operationIndex];
    if (operation === undefined) continue;
    const stagedFile = await dryRunOne(
      operation,
      resolved,
      expectedShaMap,
      pathsTouched,
    );
    staged.push(stagedFile);
  }
  return staged;
}

async function dryRunOne(
  operation: PatchFileOperation,
  resolved: ReadonlyMap<string, string>,
  expectedShaMap: Readonly<Record<string, string>> | undefined,
  pathsTouched: Set<string>,
): Promise<StagedFile> {
  switch (operation.kind) {
    case "add":
      return dryRunAdd(operation, resolved, expectedShaMap, pathsTouched);
    case "update":
      return dryRunUpdate(operation, resolved, expectedShaMap, pathsTouched);
    case "delete":
      return dryRunDelete(operation, resolved, expectedShaMap, pathsTouched);
    case "move":
      return dryRunMove(operation, resolved, expectedShaMap, pathsTouched);
  }
}

async function dryRunAdd(
  operation: Extract<PatchFileOperation, { kind: "add" }>,
  resolved: ReadonlyMap<string, string>,
  expectedShaMap: Readonly<Record<string, string>> | undefined,
  pathsTouched: Set<string>,
): Promise<StagedFile> {
  const absolutePath = resolved.get(operation.path) as string;
  if (pathsTouched.has(absolutePath)) {
    throw new DryRunError(
      toolError(
        "patch_apply_error",
        `Path appears multiple times in patch: ${operation.path}`,
        {
          path: operation.path,
          recoverable: false,
          details: { reason: "duplicate_path" },
        },
      ),
    );
  }
  pathsTouched.add(absolutePath);

  try {
    await stat(absolutePath);
    throw new DryRunError(
      toolError(
        "already_exists",
        `Cannot Add File — already exists: ${operation.path}`,
        {
          path: operation.path,
          recoverable: false,
        },
      ),
    );
  } catch (caughtError) {
    if (caughtError instanceof DryRunError) throw caughtError;
    const code = (caughtError as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") throw caughtError;
  }

  // Parent must exist (apply_patch never mkdir-ps).
  try {
    const parentStat = await stat(dirname(absolutePath));
    if (!parentStat.isDirectory()) {
      throw new DryRunError(
        toolError(
          "not_found",
          `Parent of ${operation.path} is not a directory`,
          { path: operation.path, recoverable: false },
        ),
      );
    }
  } catch (caughtError) {
    if (caughtError instanceof DryRunError) throw caughtError;
    const code = (caughtError as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new DryRunError(
        toolError(
          "not_found",
          `Parent directory of ${operation.path} does not exist`,
          {
            path: operation.path,
            recoverable: true,
            suggestedNextAction:
              "Use `create_file` to create the parent directory chain before re-running apply_patch.",
          },
        ),
      );
    }
    throw caughtError;
  }

  const expectedSha = expectedShaMap?.[operation.path];
  if (
    expectedSha !== undefined &&
    expectedSha !== PATCH_ADD_FILE_SENTINEL_SHA
  ) {
    throw new DryRunError(
      toolError(
        "stale_file",
        `expectedSha256ByPath for Add File ${operation.path} must be "" (sentinel)`,
        {
          path: operation.path,
          recoverable: false,
          suggestedNextAction:
            'Use the empty string "" to assert the file does not exist, or omit the entry entirely.',
        },
      ),
    );
  }

  const afterBytes = Buffer.from(operation.content, "utf8");
  const afterSha256 = sha256OfBuffer(afterBytes);
  return {
    operation: "add",
    path: operation.path,
    absolutePath,
    afterBytes,
    afterSha256,
    committed: false,
  };
}

async function dryRunUpdate(
  operation: Extract<PatchFileOperation, { kind: "update" }>,
  resolved: ReadonlyMap<string, string>,
  expectedShaMap: Readonly<Record<string, string>> | undefined,
  pathsTouched: Set<string>,
): Promise<StagedFile> {
  const absolutePath = resolved.get(operation.path) as string;
  if (pathsTouched.has(absolutePath)) {
    throw new DryRunError(
      toolError(
        "patch_apply_error",
        `Path appears multiple times in patch: ${operation.path}`,
        {
          path: operation.path,
          recoverable: false,
          details: { reason: "duplicate_path" },
        },
      ),
    );
  }
  pathsTouched.add(absolutePath);

  const beforeBytes = await readSourceFile(operation.path, absolutePath);
  const beforeSha256 = sha256OfBuffer(beforeBytes);
  checkExpectedSha(operation.path, beforeSha256, expectedShaMap);

  const beforeText = beforeBytes.toString("utf8");
  let afterText: string;
  try {
    afterText = applyUpdateHunks(operation.path, beforeText, operation.hunks);
  } catch (caughtError) {
    if (caughtError instanceof PatchApplyError) {
      throw new DryRunError(hunkErrorToToolError(caughtError));
    }
    throw caughtError;
  }
  const afterBytes = Buffer.from(afterText, "utf8");
  const afterSha256 = sha256OfBuffer(afterBytes);
  return {
    operation: "update",
    path: operation.path,
    absolutePath,
    beforeBytes,
    afterBytes,
    beforeSha256,
    afterSha256,
    committed: false,
  };
}

async function dryRunDelete(
  operation: Extract<PatchFileOperation, { kind: "delete" }>,
  resolved: ReadonlyMap<string, string>,
  expectedShaMap: Readonly<Record<string, string>> | undefined,
  pathsTouched: Set<string>,
): Promise<StagedFile> {
  const absolutePath = resolved.get(operation.path) as string;
  if (pathsTouched.has(absolutePath)) {
    throw new DryRunError(
      toolError(
        "patch_apply_error",
        `Path appears multiple times in patch: ${operation.path}`,
        {
          path: operation.path,
          recoverable: false,
          details: { reason: "duplicate_path" },
        },
      ),
    );
  }
  pathsTouched.add(absolutePath);

  const beforeBytes = await readSourceFile(operation.path, absolutePath);
  const beforeSha256 = sha256OfBuffer(beforeBytes);
  checkExpectedSha(operation.path, beforeSha256, expectedShaMap);

  return {
    operation: "delete",
    path: operation.path,
    absolutePath,
    beforeBytes,
    beforeSha256,
    committed: false,
  };
}

async function dryRunMove(
  operation: Extract<PatchFileOperation, { kind: "move" }>,
  resolved: ReadonlyMap<string, string>,
  expectedShaMap: Readonly<Record<string, string>> | undefined,
  pathsTouched: Set<string>,
): Promise<StagedFile> {
  if (operation.fromPath === operation.toPath) {
    throw new DryRunError(
      toolError(
        "command_failed",
        `Move File requires distinct from/to (got ${operation.fromPath})`,
        { path: operation.fromPath, recoverable: false },
      ),
    );
  }
  const absoluteFrom = resolved.get(operation.fromPath) as string;
  const absoluteTo = resolved.get(operation.toPath) as string;
  for (const touchedAbsolute of [absoluteFrom, absoluteTo]) {
    if (pathsTouched.has(touchedAbsolute)) {
      throw new DryRunError(
        toolError(
          "patch_apply_error",
          `Path appears multiple times in patch: ${touchedAbsolute === absoluteFrom ? operation.fromPath : operation.toPath}`,
          {
            path:
              touchedAbsolute === absoluteFrom
                ? operation.fromPath
                : operation.toPath,
            recoverable: false,
            details: { reason: "duplicate_path" },
          },
        ),
      );
    }
    pathsTouched.add(touchedAbsolute);
  }

  const beforeBytes = await readSourceFile(operation.fromPath, absoluteFrom);
  const beforeSha256 = sha256OfBuffer(beforeBytes);
  checkExpectedSha(operation.fromPath, beforeSha256, expectedShaMap);

  // Destination must not exist (apply_patch never overwrites).
  try {
    await stat(absoluteTo);
    throw new DryRunError(
      toolError(
        "already_exists",
        `Move destination already exists: ${operation.toPath}`,
        { path: operation.toPath, recoverable: false },
      ),
    );
  } catch (caughtError) {
    if (caughtError instanceof DryRunError) throw caughtError;
    const code = (caughtError as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") throw caughtError;
  }
  try {
    const parentStat = await stat(dirname(absoluteTo));
    if (!parentStat.isDirectory()) {
      throw new DryRunError(
        toolError(
          "not_found",
          `Move destination parent is not a directory: ${operation.toPath}`,
          { path: operation.toPath, recoverable: false },
        ),
      );
    }
  } catch (caughtError) {
    if (caughtError instanceof DryRunError) throw caughtError;
    const code = (caughtError as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new DryRunError(
        toolError(
          "not_found",
          `Move destination parent does not exist: ${operation.toPath}`,
          { path: operation.toPath, recoverable: false },
        ),
      );
    }
    throw caughtError;
  }

  let afterText = beforeBytes.toString("utf8");
  if (operation.hunks.length > 0) {
    try {
      afterText = applyUpdateHunks(
        operation.fromPath,
        afterText,
        operation.hunks,
      );
    } catch (caughtError) {
      if (caughtError instanceof PatchApplyError) {
        throw new DryRunError(hunkErrorToToolError(caughtError));
      }
      throw caughtError;
    }
  }
  const afterBytes = Buffer.from(afterText, "utf8");
  const afterSha256 = sha256OfBuffer(afterBytes);
  return {
    operation: "move",
    path: operation.fromPath,
    toPath: operation.toPath,
    absolutePath: absoluteFrom,
    absoluteToPath: absoluteTo,
    beforeBytes,
    afterBytes,
    beforeSha256,
    afterSha256,
    committed: false,
  };
}

async function readSourceFile(
  path: string,
  absolutePath: string,
): Promise<Buffer> {
  try {
    return await readFile(absolutePath);
  } catch (caughtError) {
    const code = (caughtError as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new DryRunError(
        toolError("not_found", `File does not exist: ${path}`, {
          path,
          recoverable: false,
        }),
      );
    }
    throw caughtError;
  }
}

function checkExpectedSha(
  path: string,
  actualSha256: string,
  expectedShaMap: Readonly<Record<string, string>> | undefined,
): void {
  const expectedSha = expectedShaMap?.[path];
  if (expectedSha === undefined) return;
  if (expectedSha === actualSha256) return;
  throw new DryRunError(
    toolError("stale_file", `File has changed since last read: ${path}`, {
      path,
      recoverable: true,
      suggestedNextAction: STALE_FILE_RECOVERY_HINT,
      details: { expectedSha256: expectedSha, actualSha256 },
    }),
  );
}

function hunkErrorToToolError(patchError: PatchApplyError) {
  if (patchError.reason === "multiple_matches") {
    return toolError("multiple_matches", patchError.message, {
      path: patchError.path,
      recoverable: true,
      details: { hunkIndex: patchError.hunkIndex, reason: patchError.reason },
      suggestedNextAction:
        "Add more surrounding context lines to the hunk so it matches a unique location.",
    });
  }
  return toolError("patch_apply_error", patchError.message, {
    path: patchError.path,
    recoverable: false,
    details: { hunkIndex: patchError.hunkIndex, reason: patchError.reason },
  });
}

async function stageWrite(
  targetAbsolutePath: string,
  bytes: Buffer,
): Promise<string> {
  const suffix = randomBytes(6).toString("hex");
  const stagedPath = `${targetAbsolutePath}.${suffix}${PATCH_STAGING_SUFFIX}`;
  await writeFile(stagedPath, bytes, { flag: "wx" });
  return stagedPath;
}

async function commitOne(
  staged: StagedFile,
  workspaceRoot: string,
  trashMetadata?: Partial<
    Pick<TrashMetadata, "sessionId" | "runId" | "agentName">
  >,
): Promise<void> {
  if (staged.operation === "delete") {
    staged.trashedTo = await moveToTrash(
      workspaceRoot,
      staged.absolutePath,
      trashMetadata,
    );
    return;
  }
  if (staged.operation === "move") {
    const stagedTempPath = staged.stagedTempPath as string;
    const destinationPath = staged.absoluteToPath as string;
    try {
      await rename(stagedTempPath, destinationPath);
    } catch (caughtError) {
      const code = (caughtError as NodeJS.ErrnoException).code;
      if (code === "EXDEV") {
        await copyFile(stagedTempPath, destinationPath);
        await unlink(stagedTempPath);
      } else {
        throw caughtError;
      }
    }
    // Now delete the move source.
    await unlink(staged.absolutePath);
    return;
  }
  // add / update — rename staged temp into target.
  const stagedTempPath = staged.stagedTempPath as string;
  try {
    await rename(stagedTempPath, staged.absolutePath);
  } catch (caughtError) {
    const code = (caughtError as NodeJS.ErrnoException).code;
    if (code === "EXDEV") {
      await copyFile(stagedTempPath, staged.absolutePath);
      await unlink(stagedTempPath);
    } else {
      throw caughtError;
    }
  }
}

async function rollback(
  committedFiles: ReadonlyArray<StagedFile>,
  allStaged: ReadonlyArray<StagedFile>,
): Promise<void> {
  // Reverse-order so a move's destination is undone before its source.
  for (let index = committedFiles.length - 1; index >= 0; index--) {
    const staged = committedFiles[index];
    if (staged === undefined) continue;
    try {
      if (staged.operation === "delete") {
        if (
          staged.trashedTo !== undefined &&
          staged.beforeBytes !== undefined
        ) {
          // Restore from trash by copying bytes back (avoids cross-device).
          await writeFile(staged.absolutePath, staged.beforeBytes);
          try {
            await unlink(staged.trashedTo);
          } catch {
            /* ignore */
          }
        }
      } else if (staged.operation === "add") {
        try {
          await unlink(staged.absolutePath);
        } catch {
          /* ignore */
        }
      } else if (staged.operation === "update") {
        if (staged.beforeBytes !== undefined) {
          await writeFile(staged.absolutePath, staged.beforeBytes);
        }
      } else if (staged.operation === "move") {
        if (
          staged.beforeBytes !== undefined &&
          staged.absoluteToPath !== undefined
        ) {
          // Restore source, remove destination.
          await writeFile(staged.absolutePath, staged.beforeBytes);
          try {
            await unlink(staged.absoluteToPath);
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* best-effort rollback */
    }
  }
  await cleanupStagedTempFiles(allStaged);
}

async function cleanupStagedTempFiles(
  allStaged: ReadonlyArray<StagedFile>,
): Promise<void> {
  for (const staged of allStaged) {
    if (staged.stagedTempPath === undefined) continue;
    try {
      await unlink(staged.stagedTempPath);
    } catch {
      /* already renamed or never created */
    }
  }
}

function buildDiff(staged: StagedFile): string {
  const path = staged.toPath ?? staged.path;
  const beforeText = staged.beforeBytes?.toString("utf8") ?? "";
  const afterText = staged.afterBytes?.toString("utf8") ?? "";
  if (beforeText === afterText) return "";
  return unifiedDiff(beforeText, afterText, {
    path,
    contextLines: PATCH_DEFAULT_DIFF_CONTEXT,
  });
}

function buildAuditEntry(params: {
  staged: StagedFile;
  diff: string;
  sessionId: string | undefined;
  agentName: string;
  success: boolean;
  error?: string;
}): AuditEntry {
  const { staged, diff, sessionId, agentName, success, error } = params;
  const operationName: AuditEntry["operation"] =
    staged.operation === "add"
      ? "create"
      : staged.operation === "update"
        ? "update"
        : staged.operation === "delete"
          ? "delete"
          : "move";
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    ...(sessionId !== undefined ? { sessionId } : {}),
    agentName,
    toolName: "apply_patch",
    operation: operationName,
    path: staged.path,
    ...(staged.toPath !== undefined ? { toPath: staged.toPath } : {}),
    ...(staged.beforeSha256 !== undefined
      ? { beforeSha256: staged.beforeSha256 }
      : {}),
    ...(staged.afterSha256 !== undefined
      ? { afterSha256: staged.afterSha256 }
      : {}),
    ...(diff !== "" ? { diff } : {}),
    success,
    ...(error !== undefined ? { error } : {}),
  };
  return entry;
}

async function writeAuditFailure(params: {
  sink: AuditSink;
  sessionId: string | undefined;
  agentName: string;
  atomic: boolean;
  plan: PatchPlan;
  stagedFiles: ReadonlyArray<StagedFile>;
  committedFiles: ReadonlyArray<StagedFile>;
  message: string;
}): Promise<void> {
  const {
    sink,
    sessionId,
    agentName,
    atomic,
    plan,
    stagedFiles,
    committedFiles,
    message,
  } = params;
  const failureEntry: AuditEntry = {
    timestamp: new Date().toISOString(),
    ...(sessionId !== undefined ? { sessionId } : {}),
    agentName,
    toolName: "apply_patch",
    operation: "update",
    path: stagedFiles[0]?.path ?? "(patch)",
    success: false,
    error: message,
    details: {
      atomic,
      hunkCount: plan.hunkCount,
      operations: plan.operations.length,
      committed: committedFiles.length,
    },
  };
  try {
    await sink.append(failureEntry);
  } catch {
    /* ignore */
  }
}
