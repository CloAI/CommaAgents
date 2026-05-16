# `apply_patch` Envelope Grammar (v2)

This document defines the exact wire format the `apply_patch` tool
accepts. It is adopted verbatim from OpenAI's `apply_patch` v2 grammar
so models trained against that envelope work out of the box.

The envelope is a single text blob. Whitespace is significant inside
hunks but not on the framing lines.

## Overall shape

```
*** Begin Patch
<one or more file sections>
*** End Patch
```

A file section is one of:

- **Add File**
- **Update File** (with one or more hunks)
- **Delete File**
- **Move File** (with optional hunks if the move also edits)

Sections appear in order; the patch applies in that order
(pre-validated as a single plan, then committed atomically by default).

The patch must start with `*** Begin Patch` and end with `*** End
Patch`. Any text before the first marker or after the last is a parse
error.

## Paths

Paths are workspace-relative, forward-slash separated. They are
resolved through the workspace safety helpers and rejected with
`outside_workspace` if they escape the jail. Absolute paths are
rejected with `command_failed`.

## File sections

### Add File

```
*** Add File: path/to/new.txt
+first line
+second line
+
+fourth line (blank line above)
```

- Every content line starts with `+`. The literal `+` is stripped to
  recover the file bytes; everything after it is content.
- A trailing newline is added iff the last `+` line in the section is
  non-empty. If the model wants a file without a trailing newline, it
  must end the section with a line of exactly `\ No newline at end of
  file` (same convention as unified diff).
- Fails with `already_exists` if `path` exists.
- Fails with `not_found` if the parent directory does not exist
  (mirroring `create_file` — `apply_patch` does **not** mkdir-p).

### Update File

```
*** Update File: src/foo.ts
@@ optional-header
 context line (unchanged)
-removed line
+added line
 context line (unchanged)
@@ another-hunk-header
-only-removal
+only-addition
```

- One or more hunks per file. Each hunk starts with `@@`.
- Header text after `@@` is informational (a function name, scope, or
  empty). It is **not** parsed for line numbers; we match by context.
- Inside a hunk, every line is exactly one of:
  - `" "` (space) — context line, must match the file verbatim
  - `"-"` — line to remove, must match the file verbatim
  - `"+"` — line to add
  - `"\ No newline at end of file"` — trailing-newline marker
- Matching is **zero-fuzz**: the concatenation of context + `-` lines
  must occur exactly once in the post-state of all prior hunks for
  that file. No whitespace tolerance, no line-number guidance.
- Multiple matches → `multiple_matches`.
- No match → `patch_apply_error` with
  `details: { path, hunkIndex, reason: "context_not_found" }`.
- Overlapping hunks (a later hunk's match region intersects an earlier
  hunk's edit region) → `overlapping_edits`.

### Delete File

```
*** Delete File: path/to/old.txt
```

- No body. Fails with `not_found` if the file is missing.
- The pre-image is captured in the patch plan for rollback and moved
  to the workspace trash on commit (same mechanism as `delete_file`).

### Move File

```
*** Move File: old/path.ts -> new/path.ts
```

- Optionally followed by `@@` hunks that edit the moved file in the
  same operation. Hunks apply to the **source** content; the result
  is written at the destination path.
- Fails with `not_found` if `old/path.ts` does not exist or its parent
  of `new/path.ts` does not exist.
- Fails with `already_exists` if `new/path.ts` exists.
- Identical `from -> to` → `command_failed`.

## Stale-file checks

The tool accepts an optional `expectedSha256ByPath: Record<path,
sha256>` input. For every path mentioned in the patch:

- If the path is in `expectedSha256ByPath`, the pre-image sha256 must
  match exactly. Mismatch → `stale_file` with `details.path`.
- For `Add File`, the entry is only meaningful as a sentinel
  (`expectedSha256` of the empty string `""`) asserting the file does
  not exist. Any other value → `stale_file`.

If a path is **not** in the map, no stale-check is performed for that
path. This lets the model patch read-only adjacent files without
re-reading them when the patch is locally derived.

## Atomicity

Input field `atomic` (default `true`):

- `atomic: true` — Plan is dry-run end-to-end. Every write is staged
  to a sibling tempfile (`<path>.<rand>.apply-patch.tmp`), fsync'd,
  then renamed in plan order. Deletes/moves are deferred until the
  commit phase. On any commit failure, already-renamed files are
  reverted from their captured pre-image bytes, and any staged
  tempfiles are unlinked.
- `atomic: false` — Apply sequentially; stop on first failure;
  return partial `changedFiles`. The `data.atomic` flag echoes the
  input.

## Output

```
data: {
  atomic: boolean,
  hunkCount: number,
  changedFiles: Array<{
    path: string,
    operation: "add" | "update" | "delete" | "move",
    toPath?: string,            // move only
    beforeSha256?: string,      // omitted for add
    afterSha256?: string,       // omitted for delete
    diff: string                // unified diff; "" for pure move with no edits
  }>
}
```

The string `output` is a human-readable summary suitable for echoing
back to the model:

```
Applied patch (atomic): 3 file(s), 5 hunk(s).
  A docs/new.md
  M src/foo.ts (2 hunks)
  D src/old.ts
```

## Error kinds

| `error.kind`         | When                                                |
| -------------------- | --------------------------------------------------- |
| `patch_parse_error`  | Envelope grammar violation. `details.line`.         |
| `patch_apply_error`  | Hunk context not found / add already exists / etc.  |
| `stale_file`         | `expectedSha256ByPath` mismatch.                    |
| `multiple_matches`   | Hunk context matches > 1 location.                  |
| `overlapping_edits`  | Two hunks in the same file collide.                 |
| `already_exists`     | Add or Move destination exists.                     |
| `not_found`          | Update / Delete / Move source missing, or parent dir missing for Add / Move destination. |
| `outside_workspace`  | Any path escapes the workspace jail.                |
| `permission_denied`  | Sandbox denies the path or matches forbidden globs. |
| `command_failed`     | Identical from→to in Move, absolute path, etc.      |

## Examples

### Add + Update + Delete in one patch

```
*** Begin Patch
*** Add File: src/utils/clamp.ts
+export const clamp = (n: number, lo: number, hi: number): number =>
+  Math.min(Math.max(n, lo), hi);
*** Update File: src/index.ts
@@
 import { foo } from "./foo";
+import { clamp } from "./utils/clamp";

 export { foo };
+export { clamp };
*** Delete File: src/legacy.ts
*** End Patch
```

### Move with in-place edit

```
*** Begin Patch
*** Move File: src/old-name.ts -> src/new-name.ts
@@
-export const NAME = "old-name";
+export const NAME = "new-name";
*** End Patch
```
