import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

/** Write the current process identifier to a file. */
export function writePid(pidFile: string): void {
  mkdirSync(dirname(pidFile), { recursive: true });
  writeFileSync(pidFile, String(process.pid), { mode: 0o644 });
}

/** Read a positive process identifier from a file. */
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

/** Remove a process identifier file when it exists. */
export function removePid(pidFile: string): void {
  try {
    unlinkSync(pidFile);
  } catch {}
}

/** Return whether a process identifier refers to a live process. */
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
