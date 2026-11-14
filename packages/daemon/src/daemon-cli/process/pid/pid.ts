import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

/**
 * Write the current process identifier to a file.
 *
 * @param {string} pidFile - Destination path for the process identifier.
 * @returns {void} Nothing; creates or replaces the PID file.
 */
export function writePid(pidFile: string): void {
  mkdirSync(dirname(pidFile), { recursive: true });
  writeFileSync(pidFile, String(process.pid), { mode: 0o644 });
}

/**
 * Read a positive process identifier from a file.
 *
 * @param {string} pidFile - Path of the PID file to read.
 * @returns {number | undefined} Parsed positive process identifier, if available.
 */
export function readPid(pidFile: string): number | undefined {
  if (!existsSync(pidFile)) {
    return undefined;
  }

  try {
    const parsedPid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
    return Number.isNaN(parsedPid) || parsedPid <= 0 ? undefined : parsedPid;
  } catch {
    return undefined;
  }
}

/**
 * Remove a process identifier file when it exists.
 *
 * @param {string} pidFile - Path of the PID file to remove.
 * @returns {void} Nothing; ignores a missing or inaccessible PID file.
 */
export function removePid(pidFile: string): void {
  try {
    unlinkSync(pidFile);
  } catch {}
}

/**
 * Return whether a process identifier refers to a live process.
 *
 * @param {number} pid - Process identifier to probe.
 * @returns {boolean} Whether the process exists or access is denied.
 */
export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (caughtError) {
    return (
      caughtError instanceof Error &&
      "code" in caughtError &&
      caughtError.code === "EPERM"
    );
  }
}
