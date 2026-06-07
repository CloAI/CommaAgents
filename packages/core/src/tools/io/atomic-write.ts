import { randomBytes } from "node:crypto";
import { chmod, open, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Options for {@link writeAtomic}.
 */
export interface WriteAtomicOptions {
  /**
   * Mode bits to apply to the final file. When omitted, we preserve the
   * existing target's mode (if present) or fall back to the OS default.
   */
  readonly mode?: number;
  /**
   * Whether to `fsync` the temp file before renaming. Defaults to `true`.
   * Set to `false` only in test harnesses where durability is irrelevant
   * and disk IO is the bottleneck.
   */
  readonly fsync?: boolean;
}

/**
 * Atomically write `content` to `absolutePath`.
 *
 * Implementation:
 * 1. Determine the target mode (caller override → existing target → undefined).
 * 2. Write `content` to `<dir>/<basename>.tmp-<8 hex bytes>`.
 * 3. `fsync` the temp file (unless `fsync: false`).
 * 4. `chmod` the temp file to the target mode (if known) — done before
 *    rename so the final file appears with the correct permissions
 *    atomically.
 * 5. `rename` temp → target. On POSIX this is atomic when both paths
 *    are on the same filesystem (always true here — same directory).
 * 6. On any failure, attempt to `unlink` the temp file.
 *
 * The function does **not** create parent directories — callers (e.g.
 * `create_file`) decide whether missing parents are an error.
 *
 * @throws Standard `fs` errors. Sandbox authorization is the caller's
 *   responsibility; this helper assumes `absolutePath` is already permitted.
 */
export async function writeAtomic(
  absolutePath: string,
  content: string | Uint8Array,
  options: WriteAtomicOptions = {},
): Promise<void> {
  const dir = dirname(absolutePath);
  const tempName = `.${randomBytes(8).toString("hex")}.tmp`;
  const tempPath = join(dir, tempName);

  // Resolve effective mode: explicit override > existing target's mode > none.
  let effectiveMode = options.mode;
  if (effectiveMode === undefined) {
    try {
      const existing = await stat(absolutePath);
      effectiveMode = existing.mode & 0o777;
    } catch {
      // No existing file → leave mode undefined (use OS default).
    }
  }

  try {
    await writeFile(tempPath, content);

    if (options.fsync !== false) {
      // Open + fsync + close. Bun's fs/promises returns a FileHandle.
      const handle = await open(tempPath, "r+");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    }

    if (effectiveMode !== undefined) {
      await chmod(tempPath, effectiveMode);
    }

    await rename(tempPath, absolutePath);
  } catch (error) {
    // Best-effort cleanup; swallow ENOENT if the temp was never created.
    try {
      await unlink(tempPath);
    } catch {
      /* ignore */
    }
    throw error;
  }
}
