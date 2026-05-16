# Changelog

All notable changes to `@comma-agents/core` are recorded here.

## Unreleased

### BREAKING CHANGES — built-in tool rewrite

The legacy file-system and shell built-in tools have been replaced with
a ten-tool, model-agnostic suite. **All call sites that reference the
old tool names by string, and all imports of the old factories, must
be migrated.**

#### Renamed / replaced tools

| Old name (string + factory) | New name (string + factory) |
| --- | --- |
| `"bash"` / `createBashTool` | `"run_command"` / `createRunCommandTool` |
| `"read"` / `createReadTool` | `"read_file"` / `createReadFileTool` |
| `"write"` / `createWriteTool` | `"write_file"` / `createWriteFileTool` |
| `"edit"` / `createEditTool` | `"edit_file"` / `createEditFileTool` |
| `"ls"` / `createLsTool` | `"list_directory"` / `createListDirectoryTool` |
| `"glob"` / `createGlobTool` | `"search_files"` (path mode) / `createSearchFilesTool` |
| `"grep"` / `createGrepTool` | `"search_files"` (text / regex mode) / `createSearchFilesTool` |

#### New tools

- `"create_file"` / `createCreateFileTool` — explicit "must not exist"
  create with optional parent directory creation.
- `"delete_file"` / `createDeleteFileTool` — recoverable delete with
  OS-temp trash and 7-day GC.
- `"move_file"` / `createMoveFileTool` — rename or cross-device move
  with EXDEV fallback and overwrite-by-trash semantics.
- `"apply_patch"` / `createApplyPatchTool` — OpenAI `apply_patch` v2
  envelope (Add / Update / Delete / Move). See
  `docs/patch-envelope.md`.

#### I/O shape changes

- All built-in tool results now use the structured `ToolResult`
  envelope: `{ ok: true, data, output }` on success or
  `{ ok: false, error, output }` on failure, where `error` is a
  typed `ToolError` discriminated by a `kind` field
  (`not_found`, `already_exists`, `permission_denied`,
  `outside_workspace`, `binary_file`, `file_too_large`,
  `stale_file`, `old_text_not_found`, `multiple_matches`,
  `overlapping_edits`, `patch_parse_error`, `patch_apply_error`,
  `command_failed`, `timeout`, `unknown`).
- Mutating tools require `expectedSha256` (stale-file protocol). A
  hash mismatch returns `stale_file` with the on-disk hash echoed in
  `details.actualSha256`. Read the file again to obtain the current
  hash and retry.
- `read_file` uses a two-step protocol for binary files: the first
  call returns `binary_file` with size and sha256; pass
  `allowBinary: true` on the retry to receive base64.
- `run_command` reports non-zero exit codes via `data.exitCode`
  while keeping `ok: true`; only spawn failures and policy denials
  flip `ok` to `false`. Timeouts return `kind: "timeout"` with the
  partial stdout/stderr captured up to that point.

#### Audit & session state

- Every successful or failed mutation appends an `AuditEntry` to the
  configured `AuditSink`. The default sink writes JSONL to
  `<workspace>/.comma/audit/<sessionId>.jsonl` and can be replayed
  via `buildSessionFileState` to reconstruct the session's view of
  the file system.

#### Hook back-compat

- `afterToolCall` still receives the legacy stringified `result`
  payload; only the on-the-wire `ToolResult` envelope has changed.

#### Migration

1. Replace tool-name strings in `createAgent({ tools: [...] })`,
   YAML / JSON agent configs, prompt-template `variables.tools`,
   and any registry-based lookups.
2. Replace direct imports of the old factories with their new
   counterparts.
3. Update tool-result consumers to read `result.data` / `result.error`
   instead of parsing the stringified `output`.
4. If you previously called `bash` on Windows or relied on a specific
   shell, note that `run_command` detects the platform at factory
   creation and surfaces the resolved shell in its description; pass
   `platformInfo` to `createRunCommandTool` to override for tests.
