import { join } from "node:path";
import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
/**
 *  Resolve a run directory without treating an identity as a filesystem path.
 * @param {string} runsDir - Directory containing independent run storage.
 * @param {string} runId - Stable conversation identity.
 * @returns {string} Safe directory for the selected run.
 * @internal
 */
export function runDirectory(runsDir: string, runId: string): string {
  if (runId.length === 0 || runId === "." || runId === "..") {
    throw new Error("Invalid run identity");
  }
  return join(runsDir, encodeURIComponent(runId));
}
/**
 *  Replace one durable JSON document atomically.
 * @param {string} path - Destination document path.
 * @param {unknown} value - Serializable document.
 * @returns {void} Nothing after the replacement completes.
 * @internal
 */
export function writeRunDocument(path: string, value: unknown): void {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    const descriptor = openSync(temporary, "wx");
    try {
      writeSync(descriptor, JSON.stringify(value), undefined, "utf8");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      /* The temporary file may not have been created. */
    }
    throw error;
  }
}
