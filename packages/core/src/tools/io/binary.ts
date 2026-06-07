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
