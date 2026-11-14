import type { ReadFileData } from "./read-file.types";

/**
 * Format the text and its range without duplicating metadata formatting.
 * @param {string} path - Requested file path.
 * @param {ReadFileData} data - Selected content and full-file metadata.
 * @returns {string} Summary followed by content when present.
 */
export function formatReadOutput(path: string, data: ReadFileData): string {
  const summary = `Read ${path} — lines ${data.startLine}-${data.endLine} of ${data.lineCount}, ${data.sizeBytes} bytes, sha256=${data.sha256}${data.truncated ? " (truncated)" : ""}`;
  return summary + (data.content.length > 0 ? `\n\n${data.content}` : "");
}

/**
 * Select the largest prefix of whole lines that fits the complete output budget.
 * @param {string} path - Requested file path.
 * @param {readonly string[]} lines - Requested normalized lines.
 * @param {object} metadata - Start position and full-file metadata.
 * @param {number} maxOutputBytes - Formatted output byte budget.
 * @returns {ReadFileData | undefined} Fitting content, or undefined when no line fits.
 */
export function fitReadOutput(
  path: string,
  lines: readonly string[],
  metadata: Omit<ReadFileData, "content" | "endLine" | "truncated">,
  maxOutputBytes: number,
): ReadFileData | undefined {
  const byteLengths = [0];
  for (const line of lines) {
    byteLengths.push(
      byteLengths[byteLengths.length - 1]! + Buffer.byteLength(line) + 1,
    );
  }
  const dataFor = (count: number): ReadFileData => ({
    ...metadata,
    content: lines.slice(0, count).join("\n"),
    endLine: metadata.startLine + Math.max(0, count - 1),
    truncated: count < lines.length,
  });
  const fits = (count: number): boolean => {
    const data = {
      ...metadata,
      content: "",
      endLine: metadata.startLine + Math.max(0, count - 1),
      truncated: count < lines.length,
    };
    const contentBytes = count > 0 ? byteLengths[count]! - 1 : 0;
    return (
      Buffer.byteLength(formatReadOutput(path, data)) +
        (contentBytes > 0 ? 2 + contentBytes : 0) <=
      maxOutputBytes
    );
  };
  if (fits(lines.length)) {
    return dataFor(lines.length);
  }
  let low = 1;
  let high = lines.length - 1;
  let selected = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) {
      selected = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return selected > 0 ? dataFor(selected) : undefined;
}
