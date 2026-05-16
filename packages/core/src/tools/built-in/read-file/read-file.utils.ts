import type { ReadFileData } from "./read-file.types";

/**
 * Format a short LLM-facing summary of a successful text read.
 */
export function formatTextSummary(
  filePath: string,
  data: Required<
    Pick<
      ReadFileData,
      "startLine" | "endLine" | "lineCount" | "sizeBytes" | "sha256"
    >
  > & {
    truncated: boolean;
  },
): string {
  const range = `lines ${data.startLine}-${data.endLine} of ${data.lineCount}`;
  const truncated = data.truncated ? " (truncated)" : "";
  return `Read ${filePath} — ${range}, ${data.sizeBytes} bytes, sha256=${data.sha256}${truncated}`;
}

/**
 * Truncate a UTF-8 string to at most `maxBytes` bytes without splitting a code point.
 */
export function truncateUtf8(
  content: string,
  maxBytes: number,
): { content: string; truncated: boolean } {
  const encoded = new TextEncoder().encode(content);
  if (encoded.byteLength <= maxBytes) return { content, truncated: false };
  let cut = maxBytes;
  while (cut > 0 && ((encoded[cut] ?? 0) & 0xc0) === 0x80) cut--;
  const sliced = encoded.subarray(0, cut);
  return { content: new TextDecoder("utf-8").decode(sliced), truncated: true };
}
