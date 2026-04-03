// String utilities — pure text manipulation helpers.

/**
 * Capitalize the first letter of a string.
 *
 * @example
 * ```ts
 * capitalize("openai"); // "Openai"
 * ```
 */
export function capitalize(text: string): string {
  if (text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Truncate text to `max` characters, appending "..." if truncated.
 * When `max` is 0, no truncation is applied.
 *
 * @example
 * ```ts
 * truncateText("hello world", 5); // "hello..."
 * ```
 */
export function truncateText(text: string, max: number): string {
  if (max === 0 || text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

/**
 * Replace newlines with visible `\n` markers for single-line display.
 *
 * @example
 * ```ts
 * collapseNewlines("line1\nline2"); // "line1\\nline2"
 * ```
 */
export function collapseNewlines(text: string): string {
  return text.replace(/\n/g, "\\n");
}

/**
 * Word-wrap a single line at the last space before `width` characters.
 *
 * Continuation lines are indented to match the leading whitespace of
 * the original line. If `width` is 0, the line is returned unchanged.
 * If a word is longer than the remaining width on a line, it is placed
 * on the next line (and may exceed `width` if there is no space to
 * break on).
 *
 * @example
 * ```ts
 * breakLines("the quick brown fox jumps", 15);
 * // "the quick brown\nfox jumps"
 * ```
 */
export function breakLines(line: string, width: number): string {
  if (width <= 0 || line.length <= width) return line;

  // Detect leading whitespace for continuation indent
  const match = line.match(/^(\s*)/);
  const indent = match ? match[1] : "";

  const result: string[] = [];
  let remaining = line;

  while (remaining.length > width) {
    // Find the last space at or before `width`
    let breakAt = remaining.lastIndexOf(" ", width);

    // If no space found before width, look for the first space after width
    if (breakAt <= 0) {
      breakAt = remaining.indexOf(" ", width);
    }

    // No space at all — can't break, emit the whole thing
    if (breakAt <= 0) break;

    result.push(remaining.slice(0, breakAt));
    // Skip the space we broke on, add indent for the continuation line
    remaining = indent + remaining.slice(breakAt + 1);
  }

  result.push(remaining);
  return result.join("\n");
}

/**
 * Count non-overlapping occurrences of a substring in a string.
 *
 * @example
 * ```ts
 * countOccurrences("abcabc", "abc"); // 2
 * ```
 */
export function countOccurrences(content: string, search: string): number {
  if (search.length === 0) return 0;
  let count = 0;
  let position = content.indexOf(search, 0);
  while (position !== -1) {
    count++;
    position = content.indexOf(search, position + search.length);
  }
  return count;
}
