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
import type { StructuredPatch, StructuredPatchHunk } from "diff";
import { applyPatch as diffApplyPatch } from "diff";
import {
  moveToTrash,
  STALE_FILE_RECOVERY_HINT,
  sha256OfBuffer,
  unifiedDiff,
} from "../../io";
import type { AuditEntry, AuditSink } from "../../io/audit.types";
import { okResult, toolError } from "../../result";
import type { ToolResult } from "../../tool.types";
import {
  PATCH_ADD_FILE_PREFIX,
  PATCH_ADD_FILE_SENTINEL_SHA,
  PATCH_BEGIN_MARKER,
  PATCH_DEFAULT_DIFF_CONTEXT,
  PATCH_DELETE_FILE_PREFIX,
  PATCH_END_MARKER,
  PATCH_HUNK_PREFIX,
  PATCH_MOVE_ARROW,
  PATCH_MOVE_FILE_PREFIX,
  PATCH_NO_NEWLINE_MARKER,
  PATCH_STAGING_SUFFIX,
  PATCH_UPDATE_FILE_PREFIX,
} from "./apply-patch.constants";
import type {
  ApplyPatchChangedFile,
  ApplyPatchData,
  PatchFileOperation,
  PatchHunk,
  PatchPlan,
} from "./apply-patch.types";

export class PatchParseError extends Error {
  readonly line: number;
  readonly expected: string;

  constructor(message: string, line: number, expected: string) {
    super(message);
    this.name = "PatchParseError";
    this.line = line;
    this.expected = expected;
  }
}

export class PatchApplyError extends Error {
  readonly path: string;
  readonly hunkIndex: number;
  readonly reason:
    | "context_not_found"
    | "multiple_matches"
    | "overlapping_edits";

  constructor(
    message: string,
    path: string,
    hunkIndex: number,
    reason: PatchApplyError["reason"],
  ) {
    super(message);
    this.name = "PatchApplyError";
    this.path = path;
    this.hunkIndex = hunkIndex;
    this.reason = reason;
  }
}

export class DryRunError extends Error {
  readonly toolError: ReturnType<typeof toolError>;
  constructor(toolErrorValue: ReturnType<typeof toolError>) {
    super(toolErrorValue.message);
    this.toolError = toolErrorValue;
  }
  toToolError() {
    return this.toolError;
  }
}

export class CommitFailedError extends Error {
  readonly committedFiles: ReadonlyArray<StagedFile>;
  constructor(message: string, committedFiles: ReadonlyArray<StagedFile>) {
    super(message);
    this.committedFiles = committedFiles;
  }
}

export interface StagedFile {
  readonly operation: "add" | "update" | "delete" | "move";
  readonly path: string;
  readonly toPath?: string;
  readonly absolutePath: string;
  readonly absoluteToPath?: string;
  readonly beforeBytes?: Buffer;
  readonly afterBytes?: Buffer;
  readonly beforeSha256?: string;
  readonly afterSha256?: string;
  stagedTempPath?: string;
  trashedTo?: string;
  committed: boolean;
}

export function parsePatchEnvelope(envelope: string): PatchPlan {
  const lines = splitEnvelopeLines(envelope);
  const beginIndex = lines.indexOf(PATCH_BEGIN_MARKER);
  if (beginIndex === -1) {
    throw new PatchParseError(
      `Patch must start with "${PATCH_BEGIN_MARKER}"`,
      1,
      PATCH_BEGIN_MARKER,
    );
  }
  for (let lineIndex = 0; lineIndex < beginIndex; lineIndex++) {
    const candidate = lines[lineIndex];
    if (candidate !== undefined && candidate.trim() !== "") {
      throw new PatchParseError(
        `Unexpected content before "${PATCH_BEGIN_MARKER}"`,
        lineIndex + 1,
        PATCH_BEGIN_MARKER,
      );
    }
  }

  const endIndex = lines.lastIndexOf(PATCH_END_MARKER);
  if (endIndex === -1) {
    throw new PatchParseError(
      `Patch must end with "${PATCH_END_MARKER}"`,
      lines.length,
      PATCH_END_MARKER,
    );
  }
  if (endIndex < beginIndex) {
    throw new PatchParseError(
      `"${PATCH_END_MARKER}" appears before "${PATCH_BEGIN_MARKER}"`,
      endIndex + 1,
      PATCH_END_MARKER,
    );
  }
  for (let lineIndex = endIndex + 1; lineIndex < lines.length; lineIndex++) {
    const candidate = lines[lineIndex];
    if (candidate !== undefined && candidate.trim() !== "") {
      throw new PatchParseError(
        `Unexpected content after "${PATCH_END_MARKER}"`,
        lineIndex + 1,
        "(end of input)",
      );
    }
  }

  const operations: PatchFileOperation[] = [];
  let hunkCount = 0;
  let cursor = beginIndex + 1;

  while (cursor < endIndex) {
    const rawLine = lines[cursor];
    if (rawLine === undefined || rawLine === "") {
      cursor++;
      continue;
    }
    const sourceLine = cursor + 1;

    if (rawLine.startsWith(PATCH_ADD_FILE_PREFIX)) {
      const path = rawLine.slice(PATCH_ADD_FILE_PREFIX.length).trim();
      assertNonEmptyPath(path, "Add File", sourceLine);
      const { content, nextCursor } = collectAddFileBody(
        lines,
        cursor + 1,
        endIndex,
      );
      operations.push({ kind: "add", path, content, sourceLine });
      cursor = nextCursor;
      continue;
    }

    if (rawLine.startsWith(PATCH_UPDATE_FILE_PREFIX)) {
      const path = rawLine.slice(PATCH_UPDATE_FILE_PREFIX.length).trim();
      assertNonEmptyPath(path, "Update File", sourceLine);
      const { hunks, nextCursor } = collectHunks(lines, cursor + 1, endIndex);
      if (hunks.length === 0) {
        throw new PatchParseError(
          `Update File section requires at least one "@@" hunk`,
          sourceLine,
          PATCH_HUNK_PREFIX,
        );
      }
      hunkCount += hunks.length;
      operations.push({ kind: "update", path, hunks, sourceLine });
      cursor = nextCursor;
      continue;
    }

    if (rawLine.startsWith(PATCH_DELETE_FILE_PREFIX)) {
      const path = rawLine.slice(PATCH_DELETE_FILE_PREFIX.length).trim();
      assertNonEmptyPath(path, "Delete File", sourceLine);
      operations.push({ kind: "delete", path, sourceLine });
      cursor++;
      continue;
    }

    if (rawLine.startsWith(PATCH_MOVE_FILE_PREFIX)) {
      const body = rawLine.slice(PATCH_MOVE_FILE_PREFIX.length);
      const arrowAt = body.indexOf(PATCH_MOVE_ARROW);
      if (arrowAt === -1) {
        throw new PatchParseError(
          `Move File requires "<from> -> <to>"`,
          sourceLine,
          PATCH_MOVE_ARROW.trim(),
        );
      }
      const fromPath = body.slice(0, arrowAt).trim();
      const toPath = body.slice(arrowAt + PATCH_MOVE_ARROW.length).trim();
      assertNonEmptyPath(fromPath, "Move File (from)", sourceLine);
      assertNonEmptyPath(toPath, "Move File (to)", sourceLine);
      const { hunks, nextCursor } = collectHunks(lines, cursor + 1, endIndex);
      hunkCount += hunks.length;
      operations.push({
        kind: "move",
        fromPath,
        toPath,
        hunks,
        sourceLine,
      });
      cursor = nextCursor;
      continue;
    }

    throw new PatchParseError(
      `Unexpected line "${rawLine.slice(0, 40)}" — expected a file section header`,
      sourceLine,
      "*** Add/Update/Delete/Move File",
    );
  }

  if (operations.length === 0) {
    throw new PatchParseError(
      `Patch contains no file sections`,
      beginIndex + 1,
      "*** Add/Update/Delete/Move File",
    );
  }

  return { operations, hunkCount };
}

export function applyUpdateHunks(
  path: string,
  source: string,
  hunks: ReadonlyArray<PatchHunk>,
): string {
  let working = source;
  for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex++) {
    const hunk = hunks[hunkIndex];
    if (hunk === undefined) continue;
    const structured = hunkToStructuredPatch(path, hunk);
    if (countMatches(working, hunk) > 1) {
      throw new PatchApplyError(
        `Hunk ${hunkIndex} for ${path} matches multiple locations`,
        path,
        hunkIndex,
        "multiple_matches",
      );
    }
    const result = diffApplyPatch(working, structured, { fuzzFactor: 0 });
    if (result === false) {
      throw new PatchApplyError(
        `Hunk ${hunkIndex} for ${path} could not be applied (context not found)`,
        path,
        hunkIndex,
        "context_not_found",
      );
    }
    working = result;
  }
  return working;
}

export function formatChangedFileLine(entry: ApplyPatchChangedFile): string {
  switch (entry.operation) {
    case "add":
      return `  A ${entry.path}`;
    case "delete":
      return `  D ${entry.path}`;
    case "update":
      return `  M ${entry.path}`;
    case "move": {
      const destination = entry.toPath ?? "(unknown)";
      return `  R ${entry.path} -> ${destination}`;
    }
    default:
      return `  ? ${entry.path}`;
  }
}

export async function dryRunPatch(
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

export async function commitStagedFiles(
  stagedFiles: StagedFile[],
  workspaceRoot: string,
  atomic: boolean,
): Promise<void> {
  const committedFiles: StagedFile[] = [];
  try {
    for (const staged of stagedFiles) {
      if (staged.afterBytes !== undefined) {
        const targetPath =
          staged.operation === "move"
            ? (staged.absoluteToPath as string)
            : staged.absolutePath;
        staged.stagedTempPath = await stageWrite(targetPath, staged.afterBytes);
      }
    }

    for (const staged of stagedFiles) {
      await commitOne(staged, workspaceRoot);
      staged.committed = true;
      committedFiles.push(staged);
    }
  } catch (commitError) {
    if (atomic) {
      await rollback(committedFiles, stagedFiles);
    } else {
      await cleanupStagedTempFiles(stagedFiles);
    }
    throw new CommitFailedError((commitError as Error).message, committedFiles);
  }
}

export async function buildAuditAndResult(params: {
  plan: PatchPlan;
  stagedFiles: ReadonlyArray<StagedFile>;
  atomic: boolean;
  sink: AuditSink;
  sessionId: string | undefined;
  agentName: string;
}): Promise<ToolResult<ApplyPatchData>> {
  const { plan, stagedFiles, atomic, sink, sessionId, agentName } = params;

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
}

export async function writeAuditFailure(params: {
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

function splitEnvelopeLines(envelope: string): string[] {
  const normalized = envelope.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.split("\n");
}

function assertNonEmptyPath(
  path: string,
  sectionName: string,
  line: number,
): void {
  if (path === "") {
    throw new PatchParseError(
      `${sectionName} requires a non-empty path`,
      line,
      "<path>",
    );
  }
}

function collectAddFileBody(
  lines: ReadonlyArray<string>,
  start: number,
  endIndex: number,
): { content: string; nextCursor: number } {
  const bodyLines: string[] = [];
  let suppressTrailingNewline = false;
  let cursor = start;

  while (cursor < endIndex) {
    const rawLine = lines[cursor];
    if (rawLine === undefined) {
      cursor++;
      continue;
    }
    if (rawLine.startsWith("*** ")) break;
    if (rawLine === PATCH_NO_NEWLINE_MARKER) {
      suppressTrailingNewline = true;
      cursor++;
      continue;
    }
    if (!rawLine.startsWith("+")) {
      if (rawLine === "") {
        cursor++;
        continue;
      }
      throw new PatchParseError(
        `Add File body lines must start with "+", got "${rawLine.slice(0, 40)}"`,
        cursor + 1,
        '"+<content>"',
      );
    }
    bodyLines.push(rawLine.slice(1));
    cursor++;
  }

  if (bodyLines.length === 0) {
    return { content: suppressTrailingNewline ? "" : "", nextCursor: cursor };
  }

  const joined = bodyLines.join("\n");
  const content = suppressTrailingNewline ? joined : `${joined}\n`;
  return { content, nextCursor: cursor };
}

function collectHunks(
  lines: ReadonlyArray<string>,
  start: number,
  endIndex: number,
): { hunks: PatchHunk[]; nextCursor: number } {
  const hunks: PatchHunk[] = [];
  let cursor = start;

  while (cursor < endIndex) {
    const rawLine = lines[cursor];
    if (rawLine === undefined) {
      cursor++;
      continue;
    }
    if (rawLine.startsWith("*** ")) break;
    if (rawLine === "") {
      cursor++;
      continue;
    }
    if (!rawLine.startsWith(PATCH_HUNK_PREFIX)) {
      throw new PatchParseError(
        `Expected "@@" hunk header, got "${rawLine.slice(0, 40)}"`,
        cursor + 1,
        PATCH_HUNK_PREFIX,
      );
    }
    const header = rawLine.slice(PATCH_HUNK_PREFIX.length).trim();
    const hunkSourceLine = cursor + 1;
    cursor++;
    const hunkLines: string[] = [];
    while (cursor < endIndex) {
      const candidate = lines[cursor];
      if (candidate === undefined) {
        cursor++;
        continue;
      }
      if (candidate.startsWith("*** ")) break;
      if (candidate.startsWith(PATCH_HUNK_PREFIX)) break;
      if (
        candidate === "" ||
        candidate.startsWith(" ") ||
        candidate.startsWith("-") ||
        candidate.startsWith("+") ||
        candidate === PATCH_NO_NEWLINE_MARKER
      ) {
        hunkLines.push(candidate);
        cursor++;
        continue;
      }
      throw new PatchParseError(
        `Hunk line must start with " ", "-", or "+" — got "${candidate.slice(0, 40)}"`,
        cursor + 1,
        '" "/"-"/"+"',
      );
    }
    if (hunkLines.length === 0) {
      throw new PatchParseError(
        `Hunk is empty`,
        hunkSourceLine,
        '" "/"-"/"+" content',
      );
    }
    hunks.push({ header, lines: hunkLines, sourceLine: hunkSourceLine });
  }

  return { hunks, nextCursor: cursor };
}

function hunkToStructuredPatch(path: string, hunk: PatchHunk): StructuredPatch {
  let oldLines = 0;
  let newLines = 0;
  const formattedLines: string[] = [];
  for (const rawLine of hunk.lines) {
    if (rawLine === PATCH_NO_NEWLINE_MARKER) {
      formattedLines.push(rawLine);
      continue;
    }
    const sigil = rawLine.charAt(0);
    if (sigil === " " || rawLine === "") {
      const formatted = rawLine === "" ? " " : rawLine;
      formattedLines.push(formatted);
      oldLines++;
      newLines++;
    } else if (sigil === "-") {
      formattedLines.push(rawLine);
      oldLines++;
    } else if (sigil === "+") {
      formattedLines.push(rawLine);
      newLines++;
    }
  }
  const structuredHunk: StructuredPatchHunk = {
    oldStart: 1,
    oldLines,
    newStart: 1,
    newLines,
    lines: formattedLines,
  };
  return {
    oldFileName: path,
    newFileName: path,
    oldHeader: undefined,
    newHeader: undefined,
    hunks: [structuredHunk],
  };
}

function countMatches(source: string, hunk: PatchHunk): number {
  const needleLines: string[] = [];
  for (const rawLine of hunk.lines) {
    if (rawLine === PATCH_NO_NEWLINE_MARKER) continue;
    const sigil = rawLine.charAt(0);
    if (sigil === " " || rawLine === "") {
      needleLines.push(rawLine === "" ? "" : rawLine.slice(1));
    } else if (sigil === "-") {
      needleLines.push(rawLine.slice(1));
    }
  }
  if (needleLines.length === 0) return 1;
  const needle = needleLines.join("\n");
  if (needle === "") return 1;
  let count = 0;
  let cursor = 0;
  while (cursor <= source.length) {
    const matchIndex = source.indexOf(needle, cursor);
    if (matchIndex === -1) break;
    count++;
    cursor = matchIndex + 1;
    if (count > 1) return count;
  }
  return count;
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

function hunkErrorToToolError(caughtError: PatchApplyError) {
  if (caughtError.reason === "multiple_matches") {
    return toolError("multiple_matches", caughtError.message, {
      path: caughtError.path,
      recoverable: true,
      details: { hunkIndex: caughtError.hunkIndex, reason: caughtError.reason },
      suggestedNextAction:
        "Add more surrounding context lines to the hunk so it matches a unique location.",
    });
  }
  return toolError("patch_apply_error", caughtError.message, {
    path: caughtError.path,
    recoverable: false,
    details: { hunkIndex: caughtError.hunkIndex, reason: caughtError.reason },
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
): Promise<void> {
  if (staged.operation === "delete") {
    staged.trashedTo = await moveToTrash(workspaceRoot, staged.absolutePath);
    return;
  }
  if (staged.operation === "move") {
    const stagedTempPath = staged.stagedTempPath as string;
    const destinationPath = staged.absoluteToPath as string;
    try {
      await rename(stagedTempPath, destinationPath);
    } catch (commitError) {
      const code = (commitError as NodeJS.ErrnoException).code;
      if (code === "EXDEV") {
        await copyFile(stagedTempPath, destinationPath);
        await unlink(stagedTempPath);
      } else {
        throw commitError;
      }
    }
    await unlink(staged.absolutePath);
    return;
  }
  const stagedTempPath = staged.stagedTempPath as string;
  try {
    await rename(stagedTempPath, staged.absolutePath);
  } catch (commitError) {
    const code = (commitError as NodeJS.ErrnoException).code;
    if (code === "EXDEV") {
      await copyFile(stagedTempPath, staged.absolutePath);
      await unlink(stagedTempPath);
    } else {
      throw commitError;
    }
  }
}

async function rollback(
  committedFiles: ReadonlyArray<StagedFile>,
  allStaged: ReadonlyArray<StagedFile>,
): Promise<void> {
  for (let index = committedFiles.length - 1; index >= 0; index--) {
    const staged = committedFiles[index];
    if (staged === undefined) continue;
    try {
      if (staged.operation === "delete") {
        if (
          staged.trashedTo !== undefined &&
          staged.beforeBytes !== undefined
        ) {
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
