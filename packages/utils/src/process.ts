// Process utilities — PID file management and process liveness checks.

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Write the current process PID to a file.
 *
 * Creates parent directories if they don't exist.
 *
 * @param pidFile - Absolute path to the PID file.
 */
export function writePid(pidFile: string): void {
  const directory = dirname(pidFile);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(pidFile, String(process.pid), { mode: 0o644 });
}

/**
 * Read a PID from a file.
 *
 * @param pidFile - Absolute path to the PID file.
 * @returns The PID as a number, or `undefined` if the file doesn't exist
 *          or contains non-numeric content.
 */
export function readPid(pidFile: string): number | undefined {
  if (!existsSync(pidFile)) return undefined;

  try {
    const content = readFileSync(pidFile, "utf-8").trim();
    const pid = parseInt(content, 10);
    if (Number.isNaN(pid) || pid <= 0) return undefined;
    return pid;
  } catch {
    return undefined;
  }
}

/**
 * Remove a PID file.
 *
 * No-op if the file doesn't exist.
 *
 * @param pidFile - Absolute path to the PID file.
 */
export function removePid(pidFile: string): void {
  try {
    unlinkSync(pidFile);
  } catch {
    // Ignore — file may not exist.
  }
}

/**
 * Check if a process with the given PID is currently alive.
 *
 * Uses `process.kill(pid, 0)` — signal 0 checks existence without
 * actually sending a signal. Returns `false` if the process doesn't
 * exist (ESRCH) or the caller lacks permission (EPERM on some systems
 * still indicates the process exists, but we treat it as "running" to
 * be safe).
 *
 * @param pid - The process ID to check.
 * @returns `true` if the process is alive.
 */
export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (caughtError: unknown) {
    // ESRCH = no such process → not running
    // EPERM = permission denied → process exists but we can't signal it
    if (
      caughtError instanceof Error &&
      "code" in caughtError &&
      (caughtError as any).code === "EPERM"
    ) {
      return true;
    }
    return false;
  }
}
