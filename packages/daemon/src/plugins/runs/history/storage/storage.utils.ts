import { RunErrorCode, runError } from "../../errors";
import { openSync, closeSync, readSync } from "node:fs";
import { HISTORY_INDEX_CHUNK_BYTES } from "./storage.constants";

/**
 * Read complete index rows backward without loading the entire index.
 * @param {string} path - Append-only index path.
 * @param {number} before - Exclusive byte boundary, stable across later appends.
 * @yields {{ position: number; messageId: string }} Newest rows first.
 * @returns {Generator<{ position: number; messageId: string }>} Iterator over index rows.
 * @internal
 */
export function* readHistoryIndex(
  path: string,
  before: number,
): Generator<{ position: number; messageId: string }> {
  const descriptor = openSync(path, "r");
  let position = before;
  let remainder = Buffer.alloc(0);
  try {
    while (position > 0) {
      const start = Math.max(0, position - HISTORY_INDEX_CHUNK_BYTES);
      const chunk = Buffer.alloc(position - start);
      readSync(descriptor, chunk, 0, chunk.length, start);
      const combined = Buffer.concat([chunk, remainder]);
      let end = combined.length;
      if (combined[end - 1] === 10) {
        end--;
      }
      while (end > 0) {
        const boundary = combined.lastIndexOf(10, end - 1);
        if (boundary < 0 && start > 0) {
          break;
        }
        const line = combined.subarray(boundary + 1, end).toString("utf8");
        const parsed: unknown = JSON.parse(line);
        if (typeof parsed !== "string" || parsed.length === 0) {
          throw new Error("Invalid history index entry");
        }
        yield { position: start + boundary + 1, messageId: parsed };
        end = Math.max(0, boundary);
      }
      remainder = combined.subarray(0, end);
      position = start;
    }
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Validate a cursor's ownership and immutable index boundary.
 * @param {string | undefined} cursor - Previously issued page cursor.
 * @param {string} runId - Owning conversation.
 * @param {number} size - Current index length.
 * @returns {number} Exclusive boundary to read before.
 * @internal
 */
export function historyBoundary(
  cursor: string | undefined,
  runId: string,
  size: number,
): number {
  if (cursor === undefined) {
    return size;
  }
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      parsed.version === 1 &&
      "runId" in parsed &&
      parsed.runId === runId &&
      "position" in parsed &&
      typeof parsed.position === "number" &&
      Number.isSafeInteger(parsed.position) &&
      parsed.position >= 0 &&
      parsed.position <= size
    ) {
      return parsed.position;
    }
  } catch {
    // Malformed and cross-run cursors have the same domain error contract.
  }
  throw runError({ code: RunErrorCode.INVALID_CURSOR });
}
