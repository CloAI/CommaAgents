import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/**
 * Normalize a cwd to an absolute, canonical path.
 *
 * Resolves relative paths against `process.cwd()`, then attempts `realpath`
 * to canonicalize symlinks. Falls back to the absolute path if `realpath`
 * fails (e.g. directory was removed).
 */
export function normalizeCwd(rawCwd: string): string {
  const absolute = isAbsolute(rawCwd) ? rawCwd : resolve(process.cwd(), rawCwd);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

/**
 * Hash a normalized cwd to a stable, short directory name.
 * First 16 hex chars of sha256 — collision risk is negligible for human
 * working-directory counts and the on-disk metadata still records the
 * full cwd for safety.
 */
export function hashCwd(normalizedCwd: string): string {
  return createHash("sha256").update(normalizedCwd).digest("hex").slice(0, 16);
}
