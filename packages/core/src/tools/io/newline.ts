/**
 * Newline style as detected in a source buffer.
 *
 * - `"lf"`    — Unix (`\n`). Default for new files.
 * - `"crlf"`  — Windows (`\r\n`).
 * - `"mixed"` — File contains both `\n` and `\r\n`. We preserve the
 *   dominant style on write but flag this on read.
 * - `"none"`  — No newlines at all (single line or empty file).
 */
export type NewlineStyle = "lf" | "crlf" | "mixed" | "none";

/**
 * Detect the newline style of a string by counting `\r\n` vs lone
 * `\n` occurrences.
 *
 * Lone `\r` (classic Mac OS) is treated as `none`/`lf` per modern
 * tooling — we don't try to preserve it.
 */
export function detectNewline(content: string): NewlineStyle {
  let crlf = 0;
  let lf = 0;

  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") {
      if (i > 0 && content[i - 1] === "\r") {
        crlf++;
      } else {
        lf++;
      }
    }
  }

  if (crlf === 0 && lf === 0) return "none";
  if (crlf > 0 && lf > 0) return "mixed";
  return crlf > 0 ? "crlf" : "lf";
}

/**
 * Normalize all newlines in `content` to `\n`. Used before applying
 * structural edits (so `oldText` matching is newline-agnostic);
 * `applyNewline` re-emits the original style afterwards.
 */
export function toLF(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

/**
 * Re-apply a newline style to a buffer that has been normalized to LF.
 *
 * - `"crlf"` rewrites `\n` back to `\r\n`.
 * - `"lf"`, `"mixed"`, and `"none"` leave the content as-is. (For
 *   `"mixed"` we deliberately don't try to reconstruct the original
 *   per-line pattern; preserving LF is the safer default and matches
 *   what editors do when "Use LF" is the user's setting.)
 */
export function applyNewline(content: string, style: NewlineStyle): string {
  if (style === "crlf") {
    return content.replace(/\r\n|\n/g, "\r\n");
  }
  return content;
}
