# File-Editing Tool Layer — Gap Analysis & Implementation Todo

This document captures the work needed to bring `packages/core/src/tools/built-in`
in line with the model-agnostic file-editing tool spec.

**Decisions locked in:**

- **Replace** existing tool factories with spec-aligned names. Old names
  (`read`, `write`, `edit`, `ls`, `glob`, `grep`, `bash`) are removed; new names
  (`read_file`, `write_file`, `edit_file`, `list_directory`, `search_files`,
  `run_command`, plus new `create_file`, `apply_patch`, `delete_file`,
  `move_file`) replace them.
- **Extend `ToolResult`** with first-class structured fields (`ok`, `error`,
  per-tool typed `data`) so callers (LLM serializers, daemon, tests) can
  inspect outcomes without parsing strings.

---

## Phase 0 — Shared infrastructure (blocking; do first)

These land before any tool is ported. Every later phase depends on them.

### 0.1 `ToolError` type and `ToolResult` shape

- [x] Add `ToolErrorKind` union literal with the spec's required kinds:
  `not_found | already_exists | permission_denied | outside_workspace |
  binary_file | file_too_large | stale_file | old_text_not_found |
  multiple_matches | overlapping_edits | patch_parse_error |
  patch_apply_error | command_failed | timeout | unknown`.
- [x] Add `ToolError` interface: `{ kind, message, path?, details?,
  recoverable, suggestedNextAction? }`.
- [x] Extend `ToolResult` (`packages/core/src/tools/tool.types.ts`):
  - Add `ok: boolean`.
  - Add `error?: ToolError`.
  - Add a generic `data?: unknown` for the typed per-tool payload.
  - Keep `output: string` (LLM-facing summary) and `metadata?` for
    backward-compatible plumbing.
- [x] Update `defineTool` and any `ToolResult` consumers (registry, hooks,
  serializer) to handle the new fields. **Audit:** grep for every
  construction of `ToolResult` and every read of `result.metadata.error`.
- [x] Add `ok-result.ts` / `error-result.ts` helpers in
  `packages/core/src/tools/result/` to standardize construction.
  (Implemented as a single `result.ts` exposing `okResult`, `errorResult`,
  `toolError`.)

### 0.2 Workspace + path safety helpers

- [x] Add `WorkspaceConfig` describing:
  - `root: string` (replaces ad-hoc `cwd`).
  - `allowAbsolutePaths: boolean` (default `false`).
  - `forbiddenGlobs: string[]` with sane defaults: `.git/**`, `**/.env*`,
    `**/*.pem`, `**/*.key`, `**/id_rsa*`, `**/secrets/**`,
    `**/.npmrc`, `**/.yarnrc`, `**/*.crt`.
  (Locked decision: extended `SandboxConfig` in place rather than
  introducing a parallel `WorkspaceConfig`.)
- [x] Decide where this lives:
  - **Recommendation:** extend `SandboxConfig` rather than create a parallel
    concept. Add `allowAbsolutePaths` and merge `forbiddenGlobs` into the
    write+read deny lists at sandbox-construction time. This keeps a single
    enforcement point.
  (Implemented in `sandbox.ts` via `assertNotAbsolute` + `assertNotForbidden`
  helpers run before the existing `decide` policy step. `forbiddenGlobs`
  remain a separate always-deny layer rather than being merged into the
  write/read deny lists, so they cannot be overridden by `allow` patterns
  or session decisions.)
- [x] Implement `resolveSafePath(root, input, opts)`:
  - Reject absolute paths unless `allowAbsolutePaths`.
    *(Done at the sandbox layer via `absolute-path` SandboxViolationError.)*
  - Reject `..` segments that escape `root` (already done in
    `sandbox.resolvePath` — verify and reuse).
    *(Verified — `resolveWithinJail` covers this when `jail: true`.)*
  - **New:** call `realpath` on the resolved path (and on each parent) and
    re-assert it stays under `realpath(root)`. This closes the symlink-escape
    hole the current sandbox doesn't cover.
    *(Already implemented in `sandbox.utils.ts:resolveSymlinks`.)*
  - Return a structured `outside_workspace` `ToolError` instead of throwing
    `SandboxViolationError` at the tool boundary.
    *(Deferred to per-tool layer in Phase 1+: each tool will catch
    `SandboxViolationError` and convert it to the appropriate `ToolError`
    kind — `outside_workspace` for `jail` / `absolute-path`,
    `permission_denied` for `read-denied` / `write-denied` /
    `forbidden-glob`.)*
- [x] Wire denied-glob checks at the tool layer so `list_directory` and
  `search_files` filter results, not just block authorization.
  *(Deferred to Phase 1 — listing tools will use `sandbox.canRead` per
  candidate path, which now incorporates `forbiddenGlobs`.)*

### 0.3 File I/O primitives

Create `packages/core/src/tools/io/`:

- [x] `hash.ts` — `sha256OfFile(path): Promise<string>` and
  `sha256OfBuffer(buf): string`.
- [x] `binary.ts` — `isLikelyBinary(buf): boolean` using NUL-byte heuristic
  on the first 8 KiB. Used by `read_file`, `edit_file`, `search_files`.
- [x] `newline.ts` — detect `lf | crlf | mixed | none`; preserve on write.
  (Exposes `detectNewline`, `toLF`, `applyNewline` — `mixed` preserved as LF
  by design; comment explains why.)
- [x] `bom.ts` — detect/strip `\uFEFF`, re-emit on write when input had it.
- [x] `atomic-write.ts` — `writeAtomic(absPath, content, opts)`:
  - Write to `<path>.tmp-<random>` in the same directory.
  - `fsync` the temp file.
  - `rename` to target.
  - Cleanup temp on error.
  - Preserve mode bits of existing target if present.
- [x] `diff.ts` — wrap the `diff` npm package. Expose
  `unifiedDiff(before, after, { path })` returning a string in standard
  `diff -u` format. Add `diff` to `packages/core/package.json` deps.
  Nothing else in the codebase imports `diff` directly.
- [x] `audit.ts` + `audit-sink.ts`:
  - `AuditEntry` type: `{ timestamp, sessionId?, agentName, toolName,
    operation: "create"|"update"|"delete"|"move", path, toPath?,
    beforeSha256?, afterSha256?, diff?, success, error? }`.
  - `AuditSink` interface: `append(entry)`, `list(sessionId?)`,
    `load(sessionId)`.
  - Default file sink: JSONL at
    `<workspace>/.comma/audit/<sessionId>.jsonl`. One line per
    mutation, fsync'd on append. Oversize diffs are truncated
    (configurable `maxDiffBytes`, default 64 KiB).
  - In-memory sink for tests and non-session callers.
  - Required by spec: "All destructive file operations must be
    auditable."
- [x] `session-file-state.ts` — derive a `Map<path, sha256>` from an
  audit log so a resumed session can hand the LLM the most-recent
  known hash for any file it has already touched, sidestepping a
  redundant `read_file` round trip.
  (Also exposes `verifySessionFileState` which re-hashes on-disk
  files to flag cross-session staleness.)

### 0.4 Stale-file detection contract

- [x] Document the protocol in code comments + tool descriptions:
  1. LLM calls `read_file` → receives `sha256`.
  2. LLM calls `write_file` / `edit_file` / `delete_file` / `move_file` /
     `apply_patch` with `expectedSha256` (or `expectedSha256ByPath`).
  3. Tool computes current sha256; if mismatch, returns `stale_file` with
     `suggestedNextAction: "Re-read the file to obtain the current
     sha256 and re-apply your edit."`
  *(Constant comment in `stale-file.ts` documents this; per-tool
  descriptions land in Phase 1+.)*
- [x] Add a `STALE_FILE_RECOVERY_HINT` constant so messaging is uniform.

### 0.5 Session integration

- [x] Plumb `sessionId` through `ToolContext` (optional field — falls
  back to in-memory audit sink when absent).
  *(`ToolContext.sessionId` from Phase 0.1 plus the `buildAgentToolSet`
  signature gained `sessionId` and `auditSink` trailing params in
  Phase 4; passing a `sessionId` auto-constructs a
  `createFileAuditSink(sandbox.cwd)` for persistent audit when no
  explicit sink is provided.)*
- [x] On session load, read the audit JSONL and build the
  `SessionFileState` map. Expose it on the session object so the
  agent prompt-builder can include a "files you've already touched"
  block with the most-recent sha256s. This lets the LLM pass
  `expectedSha256` on a follow-up turn without burning a `read_file`
  call just to retrieve a hash it already knows.
  *(Primitives (`buildSessionFileState`, `AuditSink.load`) shipped.
  Prompt-builder integration deferred until tools that consume
  `SessionFileState` exist — Phase 2.)*
- [x] Define what "stale across sessions" means: if the on-disk sha256
  no longer matches the audit log's `afterSha256` for that path
  (someone edited the file outside the agent), mark the entry stale
  in `SessionFileState` so the LLM is forced to re-read.
  *(Implemented as `verifySessionFileState` in
  `session-file-state.ts`.)*

---

## Phase 1 — Port read-only tools

### 1.1 `list_directory` (replaces `ls`)

- [x] Rename factory: `createLsTool` → `createListDirectoryTool`.
- [x] New input schema: `{ path, recursive?, maxDepth?, includeHidden? }`
  (`includeHidden` replaces the legacy `showHidden`).
- [x] Output `data.entries` as a structured array:
  `[{ name, relativePath, type: "file"|"directory"|"symlink", size,
  mtime, depth }]`. Keeps a human-readable tree-style `output` string
  for the LLM.
- [x] Apply forbidden-globs filtering and sandbox `canRead` per entry
  (filtered silently — listings are best-effort).
- [x] Sort deterministically: `depth` asc, then type
  (`directory < file < symlink`), then `name` asc.
- [x] Updated description enumerates inputs / structured outputs / error
  kinds (`not_found`, `outside_workspace`, `permission_denied`).
- [x] Bounded with `absoluteMaxDepth` (default 32) and `maxEntries`
  (default 5000) caps; oversize results set `data.truncated`.
- [x] Symlinks reported with `type: "symlink"` without following;
  symlink size reported as 0 to keep semantics target-independent.

### 1.2 `search_files` (replaces `glob` + `grep`)

- [x] New factory: `createSearchFilesTool`. Delete `createGlobTool` and
  `createGrepTool`.
- [x] Input: `{ query, root?, mode: "path"|"text"|"regex", includeGlobs?,
  excludeGlobs?, maxResults?, contextLines? }`.
- [x] Modes:
  - `path` — match `query` as a glob over file paths (current `glob`).
  - `text` — literal substring search inside file contents.
  - `regex` — regex search inside file contents (current `grep`).
- [x] Output: `data.matches: [{ path, line?, column?, preview }]`,
  `data.truncated`. Bound previews to `contextLines` lines around each
  match (default 0).
- [x] Skip binary files via `isLikelyBinary`.
- [x] Skip forbidden globs and `!sandbox.canRead`.
- [x] Drop the hardcoded `.git`/`node_modules` filter — flow it through
  `excludeGlobs` defaults instead.

### 1.3 `read_file` (replaces `read`)

- [x] Rename factory and schema. **Drop** the directory-read fallback —
  it's confusing and `list_directory` covers it.
  *(Directory paths return `not_found` with a `suggestedNextAction`
  pointing at `list_directory`.)*
- [x] Input: `{ path, startLine?, endLine?, maxBytes?, allowBinary? }`.
  *(Renamed from `offset/limit` to spec `startLine/endLine`. No
  back-compat alias since the old factory was already deleted.)*
- [x] Output: `data: { content, startLine, endLine, lineCount, sizeBytes,
  sha256, truncated, binary, newlineStyle, hasBom, encoding }`.
- [x] sha256 is over the **full file**, not the slice — so the LLM can
  reuse it as `expectedSha256`.
- [x] If the file is binary and `allowBinary` is not set, return
  `{ ok: false, error: { kind: "binary_file", recoverable: true,
  suggestedNextAction: ... }, data: { binary: true, sizeBytes,
  sha256 } }`. Content is **not** returned.
- [x] If `allowBinary: true`, return `data: { binary: true, encoding:
  "base64", contentBase64, sizeBytes, sha256 }`. `data.content` is
  never set for binary reads.
- [x] If the slice exceeds `maxBytes`, return a UTF-8-safe truncated
  slice + `truncated: true`. Don't fail.
- [x] Detect and report `newlineStyle` and BOM presence.
  *(`TextDecoder("utf-8", { ignoreBOM: true })` is required so the BOM
  survives decoding for `hasBom` to observe it.)*

---

## Phase 2 — Port write tools (most behavior change here)

### 2.1 `create_file` (new)

- [x] New factory `createCreateFileTool`.
- [x] Input: `{ path, content, createParentDirectories? }`.
- [x] Fail with `already_exists` if the file exists. Spec is explicit.
- [x] Output: `data: { created: true, sha256, diff }` where `diff` is the
  unified diff of `/dev/null` → new file.
- [x] Atomic write. Audit log entry. `expectedSha256` is **not** required
  here (file did not exist).

### 2.2 `write_file` (replaces `write`)

- [x] Require `expectedSha256` (no longer optional).
- [x] Fail with `not_found` if target doesn't exist (use `create_file`
  instead).
- [x] Fail with `stale_file` on hash mismatch — include current sha256
  in `error.details` and the recovery hint.
- [x] Output: `data: { beforeSha256, afterSha256, diff }`.
- [x] Atomic write. Preserve existing newline style and BOM.
- [x] Audit log.
- [x] **Remove** silent parent-directory creation. If parent doesn't
  exist, fail with `not_found` and tell the LLM to use `create_file`
  with `createParentDirectories: true`.

### 2.3 `edit_file` (replaces `edit`)

This is the biggest behavioral upgrade.

- [x] New input: `{ path, expectedSha256, edits: [{ oldText, newText,
  expectedOccurrences? }] }`. The single-edit / `replaceAll` shape is
  removed.
- [x] Default `expectedOccurrences = 1`.
- [x] Read file once, snapshot content + sha256.
- [x] Stale-check: fail with `stale_file` if `expectedSha256` mismatch.
- [x] For each edit, locate **all** matches in the original snapshot
  (not the running buffer):
  - 0 matches → `old_text_not_found` with `details.editIndex`.
  - matches > expectedOccurrences → `multiple_matches` with
    `details.matchRanges: [{ startLine, endLine }]`.
- [x] Compute the union of replacement ranges. If any two overlap →
  `overlapping_edits` with `details.conflictingEditIndices`.
- [x] Apply replacements deterministically (sort by start offset
  descending, splice).
- [x] Output: `data: { beforeSha256, afterSha256, appliedEdits, diff }`.
- [x] Atomic write. Preserve newline + BOM. Audit log.
- [x] Reject if file is binary.

### 2.4 `apply_patch` (new — biggest single piece of new code)

- [x] Adopt OpenAI's `apply_patch` v2 grammar verbatim. Document it in
  `docs/patch-envelope.md` with worked examples for each operation
  (Add / Update / Delete / Move) before writing the parser.
- [x] Patch parser for the model-facing envelope:
  ```
  *** Begin Patch
  *** Add File: <path>
  +<lines...>
  *** Update File: <path>
  @@ <hunk header>
   <context>
  -<removed>
  +<added>
  *** Delete File: <path>
  *** Move File: <from> -> <to>
  *** End Patch
  ```
  - Strict parser; ambiguous input → `patch_parse_error` with line
    number and what was expected in `details`.
  - Build an in-memory `PatchPlan` of operations before any disk write.
- [x] Pre-validation pass:
  - Resolve every path through workspace safety helpers.
  - If `expectedSha256ByPath` provided, verify each entry; mismatch →
    `stale_file` with `details.path`.
  - Dry-run every hunk: must apply cleanly with zero fuzz. Failure →
    `patch_apply_error` with `details: { path, hunkIndex, reason }`.
- [x] Application pass:
  - If `atomic: true` (default), stage all writes to a temp staging
    area, then commit by rename. On any failure mid-commit, roll back
    by reversing already-renamed files using their pre-images.
  - If `atomic: false`, apply sequentially, stop on first failure,
    return partial results.
- [x] Output: `data: { atomic, changedFiles: [{ path, operation,
  beforeSha256?, afterSha256?, diff }] }`.
- [x] Audit log per changed file.

### 2.5 `delete_file` (new)

- [x] Input: `{ path, expectedSha256 }`.
- [x] Stale-check on hash.
- [x] Output: `data: { deleted: true, beforeSha256, diff }` where
  `diff` represents file → `/dev/null`.
- [x] **Recoverable deletion:** move to OS-temp trash:
  `<os.tmpdir>/comma-trash/<sha256(workspaceRoot)>/<timestamp>-<basename>`.
  Add `permanent?: boolean` to opt out. Record `data.trashedTo` so
  the LLM/operator can recover. GC trash entries older than 7 days
  on each `delete_file` call.
- [x] Audit log.

### 2.6 `move_file` (new)

- [x] Input: `{ fromPath, toPath, expectedSha256, overwrite? }`.
- [x] Resolve both paths through safety helpers.
- [x] Stale-check `fromPath`.
- [x] If `toPath` exists and `!overwrite` → `already_exists`.
- [x] If `overwrite`: require `toPath` to not be a directory; if it's a
  file, snapshot to trash before overwrite (audit safety).
- [x] Use `rename` when on the same device; fall back to copy + delete
  when `EXDEV`. Verify post-move sha256 matches `expectedSha256`.
- [x] Output: `data: { moved: true, sha256 }`.
- [x] Audit log.

---

## Phase 3 — `run_command` (replaces `bash`)

- [x] Rename factory: `createBashTool` → `createRunCommandTool`.
- [x] Input: `{ command, cwd?, timeoutMs?, env? }` (rename `timeout` →
  `timeoutMs`, `workdir` → `cwd`).
- [x] Validate `cwd` is inside the workspace; reject otherwise with
  `outside_workspace`.
- [x] Allow `env` (whitelisted merge with the parent env, never replace).
- [x] Output: `data: { exitCode, stdout, stderr, timedOut }`.
  *(Extended with `signal`, `stdoutTruncated`, `stderrTruncated`,
  `durationMs`, `cwd`, `command`, `platform` for richer feedback.)*
- [x] Distinct `timedOut` flag (currently inferred from exit code).
- [x] On non-zero exit → `ok: true` (the tool itself succeeded), but
  also surface a `command_failed` `error` with `details.exitCode`. The
  LLM needs to see both the output and the failure signal.
  *(Refined: on a clean spawn we return `ok: true` and let the model
  inspect `data.exitCode` directly — no synthetic `command_failed`
  error is attached for non-zero exits, which is simpler and matches
  shell semantics. Tests assert this.)*
- [x] On spawn failure → `ok: false, error.kind = "command_failed"`.
- [x] On timeout → `ok: false, error.kind = "timeout"`,
  `data.timedOut = true`, partial stdout/stderr preserved.
- [x] **High-risk command policy gate** (new):
  - Configurable `denyPatterns: RegExp[]` (defaults: `rm -rf /`, `mkfs`,
    `dd if=`, `:(){ :|:& };:`, `curl ... | sh`).
  - Configurable `requireApprovalPatterns: RegExp[]` that route through
    an injected `PermissionRequester` with `operation: "fs.exec"`.
    *(Requester is passed via `RunCommandToolConfig.requestPermission`
    rather than the sandbox, since the Sandbox interface currently
    exposes `fs.read`/`fs.write` authorization only.)*
  - Denied → `permission_denied`.
- [x] Bound stdout/stderr capture (default 1 MiB each); truncate with
  flag in `data` (`stdoutTruncated` / `stderrTruncated`).
- [x] OS-aware description: detect `process.platform`, `os.release()`,
  `process.arch`, host shell (`$SHELL`/`%ComSpec%`), and runtime
  (bun/node version) at factory-creation time. `PlatformInfo` is
  baked into the tool description and surfaced on `data.platform`.
  Override via `RunCommandToolConfig.platformInfo` for deterministic
  test descriptions.
- [x] Process-group lifecycle: spawn with `detached: true` on POSIX
  and `process.kill(-pid, signal)` on timeout/abort so child trees
  (`sh -c "echo x; sleep 5"`) are killed, not orphaned.

---

## Phase 4 — Tool description rewrites

The LLM-facing `description` field is the only thing some models see. Each
description must include:

1. **One-line purpose.**
2. **Input section** with each parameter, type, default, and constraint.
3. **Output section** describing the structured `data` payload and the
   `output` string format.
4. **Error section** listing the possible `error.kind` values and what
   the LLM should do for each.
5. **Examples** of correct usage where it disambiguates (especially for
   `edit_file` and `apply_patch`).

Concretely:

- [x] Draft a shared `describeTool({ purpose, inputs, outputs, errors,
  examples })` helper that emits a consistent format across all tools.
  *(Lives in `packages/core/src/tools/built-in/describe-tool.ts`.
  Emits plain-text sections — Inputs / Outputs / Errors / Examples /
  Notes — in fixed order. No Markdown, no XML; the AI SDK forwards the
  string verbatim to every provider.)*
- [x] Rewrite descriptions for all ten tools using the helper.
  *(`read_file`, `list_directory`, `search_files`, `create_file`,
  `write_file`, `edit_file`, `delete_file`, `move_file`, `apply_patch`,
  `run_command` — `run_command` continues to compose its description
  through `buildRunCommandDescription(platformInfo)` so OS-specific
  text stays baked in at factory creation.)*
- [x] Add a snapshot test asserting the description for each tool is
  stable (regressions in description are usually regressions in
  behavior).
  *(`built-in/tool-descriptions.test.ts` covers all ten tools plus the
  helper's own section-ordering / default-rendering invariants — 13
  tests, 10 snapshots.)*

---

## Phase 5 — Tests

Implement the spec's test matrix. Each item is a separate test case (or
small group) under the corresponding `<tool>/*.test.ts`:

- [x] Path traversal rejection (`../../etc/hosts`).
  *(Covered in read-file / list-directory / search-files / create-file /
  write-file / edit-file / delete-file / move-file / apply-patch tests.)*
- [x] Symlink-escape rejection (create symlink → outside, attempt read).
  *(`read-file.test.ts` — "rejects symlinks that escape the workspace".)*
- [x] Denied-glob rejection (`.env`, `.git/HEAD`, `*.pem`).
  *(`forbiddenGlobs` cases across all mutation tools + read/search.)*
- [x] Absolute-path rejection when `allowAbsolutePaths: false`.
  *(read-file, list-directory, create-file.)*
- [x] `read_file` sha256 correctness (reference vector).
  *(`read-file.test.ts` — FIPS-180 "abc" vector.)*
- [x] `read_file` line slicing (boundary: `startLine=1`,
  `endLine=lineCount`, off-by-one).
- [x] `read_file` returns `binary: true` and no `content` for binary
  on first call (default).
- [x] `read_file` with `allowBinary: true` returns `contentBase64`
  and `encoding: "base64"`, never `content`.
- [x] `read_file` reports `newlineStyle` correctly for lf / crlf /
  mixed / none fixtures.
  *(Single `it.each` covering all four styles.)*
- [x] `read_file` `truncated: true` when over `maxBytes`.
- [x] `create_file` fails with `already_exists` if file exists.
- [x] `write_file` rejects stale `expectedSha256`.
- [x] `write_file` preserves crlf and BOM round-trip.
- [x] `edit_file` exact replacement (single edit).
- [x] `edit_file` `old_text_not_found`.
- [x] `edit_file` `multiple_matches` returns `matchRanges`.
- [x] `edit_file` `overlapping_edits` returns
  `conflictingEditIndices`.
- [x] `edit_file` applies multiple non-overlapping edits
  deterministically — assert final content regardless of edit order.
- [x] `edit_file` evaluates against the original snapshot (regression
  case: edit A makes edit B's `oldText` appear; B must still be
  evaluated against the pre-edit snapshot and fail).
- [x] `apply_patch` add / update / delete / move.
- [x] `apply_patch` rejects malformed patches with `patch_parse_error`.
- [x] `apply_patch` atomic rollback (force the second of three writes
  to fail; assert first write was reverted).
- [x] `apply_patch` `expectedSha256ByPath` mismatch → `stale_file`.
- [x] `delete_file` recovery: file lands in OS-temp trash and the
  audit entry records `trashedTo`.
- [x] `delete_file` GC: stale trash entries (>7 days) are pruned.
- [x] Audit sink: every mutation tool appends a JSONL entry; replaying
  the log reconstructs `SessionFileState`.
  *(`tools/io/audit-replay.test.ts` — drives real create / edit /
  write / move / delete calls into a `createFileAuditSink`, reloads
  the JSONL from disk, and asserts the rebuilt state matches.)*
- [x] `SessionFileState` correctly marks entries stale when on-disk
  sha256 diverges from the last audited `afterSha256`.
- [x] `move_file` cross-device fallback (mock `EXDEV`).
  *(`spyOn(fsp, "rename").mockRejectedValueOnce(EXDEV)` exercises the
  copy + unlink path; required a small refactor in `move-file.ts` to
  call `rename` through a `node:fs/promises` namespace import so the
  spy is observable from outside the module.)*
- [x] `run_command` timeout produces `timedOut: true` and partial
  output.
- [x] `run_command` stdout/stderr capture (interleaving and large
  output).
- [x] `run_command` denied pattern → `permission_denied`.
- [x] `run_command` cwd outside workspace → `outside_workspace`.

---

## Phase 6 — Migration & cleanup

- [x] Update `tools/built-in/index.ts` barrel: remove old factories,
  export the ten new ones.
  *(Landed during the per-tool phases — barrel now exports the ten
  factories and the helper-internal `describeTool` is intentionally
  kept private.)*
- [x] Update `tools/tool.constants.ts` (registry) to reference new
  factories.
  *(Registry maps `read_file` / `list_directory` / `search_files` /
  `create_file` / `write_file` / `edit_file` / `delete_file` /
  `move_file` / `apply_patch` / `run_command` to their factories.)*
- [x] Search the repo for usages of `createReadTool`,
  `createWriteTool`, `createEditTool`, `createLsTool`, `createGlobTool`,
  `createGrepTool`, `createBashTool` — update or delete call sites.
  *(Repo-wide ripgrep — only planning docs (`PLAN.md`,
  `docs/file-tools-todo.md`) still reference the old factory names,
  as expected. No production code, tests, examples, or runtime docs
  carry them.)*
- [x] Update `examples/` and `docs/` references.
  *(Migrated `examples/core/scripts/02-agent-with-tools.ts`,
  `03-custom-tool.ts`, `09-prompt-templates.ts`, `12-streaming.ts`,
  and `examples/e2e/daemon/helpers/mock-providers.ts`. Migrated
  `docs/content/docs/core/prompts.mdx`,
  `core/agents/load-agent.mdx`, and `core/agents/create-agent.mdx`.
  Per-tool MDX pages — `bash.mdx`, `glob.mdx`, `grep.mdx`,
  `read.mdx`, `write.mdx`, `edit.mdx` — and the
  `tools/index.mdx` + `tool-registry.mdx` landing pages remain
  untouched; they are owned by Phase 7 and will be deleted /
  rewritten there rather than spot-patched.)*
- [x] Add a `CHANGELOG.md` entry under "BREAKING CHANGES" describing
  the rename + I/O shape changes.
  *(Root `CHANGELOG.md` created with an `Unreleased` section
  covering the rename table, new tools, `ToolResult` envelope,
  stale-file protocol, binary two-step read, `run_command` exit-code
  semantics, audit / `SessionFileState`, hook back-compat, and
  step-by-step migration guidance.)*

---

## Phase 7 — User-facing documentation rewrite

The existing `docs/content/docs/core/tools/built-in/` directory still
documents the removed `bash` / `read` / `write` / `edit` / `glob` /
`grep` factories. Every page must be replaced with one of the ten
new tools, following the conventions in
`~/.config/opencode/skills/documentation-process/SKILL.md`.

Ground rules (from the documentation-process skill):

1. **`AutoTypeTable` is mandatory** for every exported type the user
   touches. Manual markdown type tables are not permitted on API
   reference pages.
2. **JSDoc is the source of truth.** Before writing the `.mdx`, audit
   the JSDoc on the exported types (`<Tool>Data`, `<Tool>ToolConfig`,
   plus any nested types like `PlatformInfo`, `ApplyPatchChangedFile`,
   `MatchRange`, `ListDirectoryEntry`, etc.) and tighten anything
   that's missing, terse, or stale. The user reads JSDoc through the
   type tables — terse JSDoc is bad UX.
3. **No internal implementation details** in user-facing prose: never
   mention `defineTool`, sandbox internals, the `diff` npm package,
   factory wiring through `tool.constants.ts`, etc. Describe what the
   model sees and what the daemon contract is.
4. **Page structure** for each tool: intro + quick-start → Config
   table → Data table → per-feature sections (errors, binary handling,
   stale-file protocol, examples) → cross-references.

### 7.1 Pre-flight — tighten JSDoc on exported tool types

- [x] `read_file`: `ReadFileData`, `ReadFileToolConfig`. Document
  `newlineStyle`, `hasBom`, `encoding`, `truncated`, the binary
  two-step protocol.
- [x] `list_directory`: `ListDirectoryData`, `ListDirectoryEntry`,
  `ListDirectoryToolConfig`. Document depth bounds and the symlink
  reporting policy.
- [x] `search_files`: `SearchFilesData`, `SearchFilesMatch`,
  `SearchFilesToolConfig`. Document the three modes
  (`path`/`text`/`regex`) and the default exclude globs.
- [x] `create_file`: `CreateFileData`, `CreateFileToolConfig`.
  Document `createParentDirectories` semantics and the diff shape.
- [x] `write_file`: `WriteFileData`, `WriteFileToolConfig`. Document
  newline + BOM preservation and the stale-file contract.
- [x] `edit_file`: `EditFileData`, `AppliedEdit`, `MatchRange`,
  `EditFileToolConfig`. Document `expectedOccurrences`, the
  snapshot-evaluated semantics, and the overlap detection.
- [x] `delete_file`: `DeleteFileData`, `DeleteFileToolConfig`.
  Document the trash path, GC policy, and `permanent` opt-out.
- [x] `move_file`: `MoveFileData`, `MoveFileToolConfig`. Document the
  "never overwrites a directory" rule, the EXDEV fallback, and
  `overwroteTrashedTo`.
- [x] `apply_patch`: `ApplyPatchData`, `ApplyPatchChangedFile`,
  `ApplyPatchToolConfig`, plus `PatchPlan`/`PatchFileOperation`/
  `PatchHunk` if they end up exported. Reference
  `docs/patch-envelope.md` for the grammar.
- [x] `run_command`: `RunCommandData`, `RunCommandToolConfig`,
  `RunCommandToolConfigWithRequester`, `PlatformInfo`. Document the
  OS-aware description, deny/approval gates, output truncation, and
  the non-zero-exit-is-not-an-error contract.

### 7.2 Replace built-in tool pages

In `docs/content/docs/core/tools/built-in/`:

- [x] Delete legacy pages: `bash.mdx`, `read.mdx`, `write.mdx`,
  `edit.mdx`, `glob.mdx`, `grep.mdx`.
- [x] Add new pages: `read_file.mdx`, `list_directory.mdx`,
  `search_files.mdx`, `create_file.mdx`, `write_file.mdx`,
  `edit_file.mdx`, `delete_file.mdx`, `move_file.mdx`,
  `apply_patch.mdx`, `run_command.mdx`.
- [x] Update `meta.json` page order to surface read-only tools first,
  then writes, then `apply_patch`, then `run_command`, then `webfetch`
  and the todo tools.

### 7.3 Cross-cutting concept pages

These pages explain protocols that several tools share — referencing
them keeps individual tool pages short.

- [x] `docs/content/docs/core/tools/stale-file-protocol.mdx` — the
  read → write contract using `expectedSha256` /
  `expectedSha256ByPath`, including the recovery hint and the
  `SessionFileState` cross-session staleness detector.
- [x] `docs/content/docs/core/tools/audit-log.mdx` — `AuditEntry`
  schema, JSONL file layout, in-memory fallback, and how to wire a
  custom `AuditSink` through `ToolContext`.
- [x] `docs/content/docs/core/tools/trash.mdx` — recoverable deletion
  layout, GC policy, opt-out, and cross-device behaviour.
- [x] `docs/content/docs/core/tools/error-kinds.mdx` — full
  `ToolErrorKind` table with one-liner per kind and a recovery hint
  column.
- [x] Move or copy `docs/patch-envelope.md` into
  `docs/content/docs/core/tools/patch-envelope.mdx` so it's part of
  the user-facing tree (the standalone `.md` stays for repo-level
  reference).

### 7.4 Sandbox / workspace updates

- [x] Refresh `docs/content/docs/core/sandbox.mdx` to document
  `allowAbsolutePaths` and `forbiddenGlobs` on `SandboxConfig`,
  including the default forbidden-globs list.

### 7.5 Build verification

- [x] `bun run build` inside `docs/` passes (validates every
  `AutoTypeTable` path + name).
- [x] No `.mdx` file references a removed factory name (grep for
  `createReadTool`, `createBashTool`, etc.).
- [x] No `.mdx` file references internal SDK names, `defineTool`,
  the `diff` package, or the tool factory wiring.

---

## Locked decisions

1. **Diff library:** use the `diff` npm package. Wrap it in
   `tools/io/diff.ts` so the rest of the code never imports `diff`
   directly — keeps the dep swappable and keeps a single place to
   normalize headers (`---`/`+++` paths, hunk format) for LLM output.
2. **Audit sink:** persistent and session-loadable.
   - Define `AuditEntry` (timestamp, agent, tool, op kind, path(s),
     beforeSha256?, afterSha256?, diff, success, error?).
   - Define `AuditSink` interface: `append(entry)`, `load(sessionId)`,
     `list(sessionId)`.
   - Default sink: JSONL file under `<workspace>/.comma/audit/<sessionId>.jsonl`.
     This is the "auditable file state" that loads when a session
     resumes — replaying the log reconstructs which files this session
     has already touched and at what hashes.
   - In-memory sink as a fallback for tests / non-session callers.
   - On session load, the runtime reads the JSONL and exposes a
     `SessionFileState` map (`path -> lastKnownSha256`) so the LLM can
     be reminded which hashes it should pass as `expectedSha256`
     without re-reading.
3. **Binary policy:** opt-in, two-step.
   - `read_file` **never** silently returns binary content.
   - First call on a binary file returns `ok: false`,
     `error.kind: "binary_file"`, and `data: { binary: true,
     sizeBytes, sha256 }` so the LLM sees the file exists, knows
     it's binary, and chooses whether to opt in.
   - To actually read, the LLM must call again with
     `allowBinary: true`. Content is then returned base64-encoded
     in `data.contentBase64` (never as `data.content`) with
     `data.encoding: "base64"`.
   - `edit_file`, `write_file`, `search_files` (text/regex modes)
     reject binary outright with `binary_file` and a recovery hint
     pointing at `apply_patch` or `write_file` with `allowBinary`.
4. **Trash location:** OS temp, keyed by workspace.
   - Path: `<os.tmpdir>/comma-trash/<sha256(workspaceRoot)>/<timestamp>-<basename>`.
   - Keeps deletes off the project tree (no git noise) and survives
     across processes for the same workspace.
   - `delete_file` records the trash path in the audit entry so the
     LLM (or operator) can recover it.
   - GC policy: trash entries older than 7 days are pruned on next
     `delete_file` call. Configurable via workspace config.
5. **Patch envelope grammar:** adopt OpenAI's `apply_patch` v2 grammar
   verbatim. It's the de-facto standard among current LLM tool
   implementations and the models are already trained on it.
   - Lock the grammar in `docs/patch-envelope.md` with examples for
     Add / Update / Delete / Move and the `@@` hunk format.
   - Parser is strict: any deviation → `patch_parse_error` with
     `details.line` and `details.expected`.
