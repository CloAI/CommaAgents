import { getAbsolutePosition } from "../../utils/yogaLayout";

export { getAbsolutePosition };

/** ANSI escape: save cursor position. */
export const CURSOR_SAVE = "\x1b7";

/** ANSI escape: restore cursor position. */
export const CURSOR_RESTORE = "\x1b8";

/**
 * ANSI CUP (Cursor Position) escape — moves cursor to an absolute
 * row and column. Both are 1-indexed per the ANSI spec.
 */
export function cursorTo(row: number, col: number): string {
  return `\x1b[${row};${col}H`;
}

/**
 * Build a single string that saves the cursor, writes each line at
 * the correct absolute position, then restores the cursor.
 *
 * @param lines  - Array of pre-formatted line strings (may contain ANSI color codes).
 * @param top    - 0-indexed row offset of the region's first line within Ink output.
 * @param left   - 0-indexed column offset of the region's left edge.
 * @param width  - Region width in columns. Lines shorter than this are right-padded
 *                 with spaces to clear stale content.
 */
export function buildRegionOutput(
  lines: readonly string[],
  top: number,
  left: number,
  width: number,
): string {
  let output = CURSOR_SAVE;

  for (let rowIndex = 0; rowIndex < lines.length; rowIndex++) {
    const line = lines[rowIndex];
    if (line === undefined) continue;

    // +1 because ANSI cursor positions are 1-indexed.
    output += cursorTo(top + rowIndex + 1, left + 1);
    output += fitToWidth(line, width);
  }

  output += CURSOR_RESTORE;
  return output;
}

/**
 * Strip ANSI escape sequences from a string to calculate its
 * visible character length.
 */
export function visibleLength(str: string): number {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes requires matching control chars
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/**
 * Pad a string to at least `width` visible characters.
 * ANSI escape sequences are not counted toward the width.
 *
 * Note: this does not truncate — use {@link fitToWidth} when you need both
 * padding and clipping.
 */
export function padToWidth(str: string, width: number): string {
  const visible = visibleLength(str);
  if (visible >= width) return str;
  return str + " ".repeat(width - visible);
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI SGR escapes requires control chars
const ANSI_SGR_PATTERN = /\x1b\[[0-9;]*m/g;

/**
 * Pad or truncate a string to exactly `width` visible characters while
 * preserving ANSI SGR (color/style) escape sequences.
 *
 * - If the visible length is less than `width`, the string is right-padded
 *   with spaces.
 * - If the visible length exceeds `width`, the string is clipped at the
 *   `width`-th visible character. Any ANSI SGR escapes encountered before
 *   the clip point are preserved verbatim, and a reset (`\x1b[0m`) is
 *   appended if any escape was emitted, to prevent color bleeding into
 *   subsequent output.
 *
 * @param str   - Input string, possibly containing ANSI SGR escapes.
 * @param width - Target visible width in columns.
 */
export function fitToWidth(str: string, width: number): string {
  const visible = visibleLength(str);
  if (visible === width) return str;
  if (visible < width) return str + " ".repeat(width - visible);

  // Truncation path — walk the string, copying ANSI escapes verbatim and
  // counting only visible chars. Stop once `width` visible chars have been
  // emitted.
  let result = "";
  let visibleEmitted = 0;
  let cursor = 0;
  let sawEscape = false;

  // Reset the regex's lastIndex on each call.
  ANSI_SGR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = ANSI_SGR_PATTERN.exec(str);

  while (visibleEmitted < width && cursor < str.length) {
    // If the next ANSI escape starts at the cursor, emit it whole.
    if (match && match.index === cursor) {
      result += match[0];
      sawEscape = true;
      cursor += match[0].length;
      match = ANSI_SGR_PATTERN.exec(str);
      continue;
    }

    // Otherwise, emit one visible character.
    const nextEscapeStart = match ? match.index : str.length;
    const remainingVisible = width - visibleEmitted;
    const sliceEnd = Math.min(cursor + remainingVisible, nextEscapeStart);
    result += str.slice(cursor, sliceEnd);
    visibleEmitted += sliceEnd - cursor;
    cursor = sliceEnd;
  }

  // Reset SGR state if any escape was emitted, so trailing styles don't
  // bleed into whatever follows on the same row.
  if (sawEscape) result += "\x1b[0m";

  return result;
}
