import type { DOMElement } from "ink";

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
 * Walk up the Yoga layout tree from a DOMElement to compute its
 * absolute top/left position within Ink's terminal output.
 *
 * Each node's `getComputedTop()` / `getComputedLeft()` is relative
 * to its parent, so we accumulate offsets up to the root.
 */
export function getAbsolutePosition(node: DOMElement): {
  top: number;
  left: number;
} {
  let top = 0;
  let left = 0;
  let current: DOMElement | undefined = node;

  while (current) {
    const yoga = current.yogaNode;
    if (yoga) {
      top += yoga.getComputedTop();
      left += yoga.getComputedLeft();
    }
    current = current.parentNode;
  }

  return { top, left };
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
    output += padToWidth(line, width);
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
 * Pad or truncate a string to exactly `width` visible characters.
 * ANSI escape sequences are not counted toward the width.
 */
export function padToWidth(str: string, width: number): string {
  const visible = visibleLength(str);
  if (visible >= width) return str;
  return str + " ".repeat(width - visible);
}
