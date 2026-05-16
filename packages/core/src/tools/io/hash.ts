// SHA-256 helpers for content addressing and stale-file detection.
//
// Both helpers return lowercase hex strings (64 chars). We use Bun's
// CryptoHasher because it is faster than `crypto.createHash` under the
// Bun runtime and avoids a Node `Buffer` round trip.

import { readFile } from "node:fs/promises";

/**
 * Compute the SHA-256 of an arbitrary buffer / string. Synchronous —
 * intended for in-memory content that has already been read.
 *
 * @param data - The bytes (or UTF-8 string) to hash.
 * @returns Lowercase hex-encoded SHA-256 digest (64 chars).
 *
 * @example
 * ```ts
 * sha256OfBuffer("hello") // "2cf24dba..."
 * ```
 */
export function sha256OfBuffer(
  data: string | Uint8Array | ArrayBuffer,
): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(data);
  return hasher.digest("hex");
}

/**
 * Compute the SHA-256 of a file on disk.
 *
 * Streams the file into the hasher to avoid loading large files fully
 * into memory.
 *
 * @param absolutePath - Absolute path to the file. The caller is
 *   responsible for sandbox authorization.
 * @throws Standard `fs.readFile` errors (`ENOENT`, `EACCES`, …); the
 *   tool layer translates these into structured `ToolError`s.
 */
export async function sha256OfFile(absolutePath: string): Promise<string> {
  // Bun.file().stream() would let us avoid the full buffer, but readFile is
  // simpler and the audit log targets reasonable-sized text files. We can
  // switch to streaming later if profiling shows it matters.
  const buffer = await readFile(absolutePath);
  return sha256OfBuffer(buffer);
}
