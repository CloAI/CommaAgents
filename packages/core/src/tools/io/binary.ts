// Heuristic detection of binary file content.
//
// The spec calls out a two-step opt-in for binary reads: the first
// `read_file` returns `binary_file` with `{ binary, sizeBytes, sha256 }`
// metadata; the LLM must re-request with `allowBinary: true` to receive
// the base64 payload. This module supplies the detection primitive.

/** Sample size in bytes used for binary detection. */
export const BINARY_DETECTION_SAMPLE_BYTES = 8 * 1024;

/**
 * Heuristically classify a buffer as binary by scanning the first
 * `BINARY_DETECTION_SAMPLE_BYTES` bytes for a NUL byte.
 *
 * NUL bytes are vanishingly rare in legitimate text encodings
 * (UTF-8, UTF-16 with BOM stripped, Latin-1) but ubiquitous in
 * binary formats (images, compiled artefacts, archives). This matches
 * the heuristic used by `git diff`, `grep`, and most editors.
 *
 * False positives (text files containing NUL) and false negatives
 * (binary files with no NUL in the first 8 KiB) are tolerated by
 * design — the opt-in flow lets the LLM override.
 */
export function isLikelyBinary(buffer: Uint8Array): boolean {
  const limit = Math.min(buffer.length, BINARY_DETECTION_SAMPLE_BYTES);
  for (let i = 0; i < limit; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}
