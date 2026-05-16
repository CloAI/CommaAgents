// Workspace trash helpers.
//
// Recoverable deletions don't go to the OS trash (platform-dependent
// and noisy); they land in an OS-temp directory keyed by the workspace
// root so deletes from the same workspace pool together across
// processes but stay isolated from unrelated workspaces.
//
// Layout:
//   <os.tmpdir>/comma-trash/<sha256(workspaceRoot)>/<timestamp>-<basename>
//
// Behaviour:
// - `trashWorkspaceDir(root)` deterministically maps a workspace to its
//   trash bucket. The path is created on demand by `moveToTrash`.
// - `moveToTrash(workspaceRoot, absSourcePath)` renames the source into
//   the bucket, falling back to copy+unlink if `EXDEV` is encountered
//   (the OS temp dir often lives on a different device than the
//   workspace).
// - `gcTrash(workspaceRoot, { maxAgeMs })` prunes bucket entries whose
//   mtime is older than `maxAgeMs` (default 7 days). Errors during GC
//   are swallowed — best-effort.

import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

/** Default trash retention: 7 days. */
export const DEFAULT_TRASH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Compute the trash bucket directory for `workspaceRoot`. The directory
 * itself is *not* created — call `moveToTrash` (which mkdirs on demand)
 * or `mkdir` it explicitly.
 */
export function trashWorkspaceDir(workspaceRoot: string): string {
  const key = createHash("sha256").update(workspaceRoot).digest("hex");
  return join(tmpdir(), "comma-trash", key);
}

/**
 * Move `absSourcePath` into the workspace's trash bucket, returning the
 * absolute destination path. Falls back to copy+unlink across devices.
 */
export async function moveToTrash(
  workspaceRoot: string,
  absSourcePath: string,
): Promise<string> {
  const bucket = trashWorkspaceDir(workspaceRoot);
  await mkdir(bucket, { recursive: true });
  // Encode the timestamp + a short random suffix so two deletes of the
  // same basename in the same millisecond don't collide.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  const dest = join(bucket, `${stamp}-${suffix}-${basename(absSourcePath)}`);

  try {
    await rename(absSourcePath, dest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EXDEV") throw err;
    // Cross-device — copy then remove the source.
    await copyFile(absSourcePath, dest);
    await unlink(absSourcePath);
  }
  return dest;
}

/** Options for `gcTrash`. */
export interface GcTrashOptions {
  /** Maximum age in milliseconds (default: 7 days). */
  readonly maxAgeMs?: number;
  /** Reference time for "now". Defaults to `Date.now()`. Test hook. */
  readonly now?: number;
}

/**
 * Best-effort GC of stale trash entries for `workspaceRoot`. Returns the
 * paths that were pruned. Failures are swallowed (a flaky temp dir
 * shouldn't break a successful delete).
 */
export async function gcTrash(
  workspaceRoot: string,
  options?: GcTrashOptions,
): Promise<readonly string[]> {
  const bucket = trashWorkspaceDir(workspaceRoot);
  const maxAge = options?.maxAgeMs ?? DEFAULT_TRASH_MAX_AGE_MS;
  const now = options?.now ?? Date.now();
  const pruned: string[] = [];

  let entries: string[];
  try {
    entries = await readdir(bucket);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }

  for (const name of entries) {
    const full = join(bucket, name);
    try {
      const st = await stat(full);
      if (now - st.mtimeMs > maxAge) {
        await rm(full, { recursive: true, force: true });
        pruned.push(full);
      }
    } catch {
      /* ignore — best-effort */
    }
  }
  return pruned;
}
