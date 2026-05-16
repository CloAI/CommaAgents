import {
  TOOL_CALL_ARGS_PREVIEW_LENGTH,
  TOOL_CALL_ELLIPSIS,
  TOOL_CALL_ERROR_PREVIEW_LENGTH,
  TOOL_CALL_GLYPH_COMPLETED,
  TOOL_CALL_GLYPH_ERROR,
} from "./ToolCallView.constants";
import type { ToolCallViewStatus } from "./ToolCallView.types";

/**
 * Collapse a possibly-multiline args blob into a single visual row and
 * clip it to {@link TOOL_CALL_ARGS_PREVIEW_LENGTH} characters.
 *
 * - CR / CRLF / LF are normalized then collapsed (along with tabs and
 *   runs of spaces) into single spaces, so JSON pretty-printed across
 *   many lines still renders as one row.
 * - Empty / all-whitespace input returns an empty string so the
 *   renderer can omit the args span entirely (no leading separator).
 * - Truncation appends a single typographic ellipsis (`\u2026`); the
 *   ellipsis is *not* counted toward the cap so the output is at most
 *   `cap + 1` characters.
 *
 * Exported so the row-height estimator can compute heights against the
 * exact same string the renderer will draw.
 */
export function formatArgsPreview(rawArgs: string): string {
  const collapsed = rawArgs.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "";
  if (collapsed.length <= TOOL_CALL_ARGS_PREVIEW_LENGTH) return collapsed;
  return `${collapsed.slice(0, TOOL_CALL_ARGS_PREVIEW_LENGTH)}${TOOL_CALL_ELLIPSIS}`;
}

/**
 * Build the trailing summary fragment for a paired tool-result.
 *
 * - `running` → empty string (no result yet).
 * - `completed` → `\u2192 N lines` where `N` is the line count of the
 *   raw output (1 for a single line, 0 for an empty string). Using
 *   line count rather than byte count surfaces the "shape" of the
 *   result without leaking content.
 * - `error` → `\u2192 <message>` clipped to
 *   {@link TOOL_CALL_ERROR_PREVIEW_LENGTH} characters; the leading
 *   newline is stripped so the message stays on the same row.
 *
 * Exported so the row estimator can mirror the rendered row exactly.
 */
export function formatResultSummary(
  status: ToolCallViewStatus,
  output: string | undefined,
  error: string | undefined,
): string {
  if (status === "running") return "";

  if (status === "error") {
    const message = (error ?? "").replace(/\s+/g, " ").trim();
    if (message.length === 0) return "\u2192 error";
    if (message.length <= TOOL_CALL_ERROR_PREVIEW_LENGTH) {
      return `\u2192 ${message}`;
    }
    return `\u2192 ${message.slice(0, TOOL_CALL_ERROR_PREVIEW_LENGTH)}${TOOL_CALL_ELLIPSIS}`;
  }

  // completed
  const text = output ?? "";
  if (text.length === 0) return "\u2192 0 lines";
  // Count rows the same way Ink will when rendering: every \n
  // introduces a new row, and a trailing \n produces an extra empty
  // row inside a bordered panel (matches countWrappedLines in
  // MessageList.utils.ts).
  const lineCount = text.split("\n").length;
  return `\u2192 ${lineCount} ${lineCount === 1 ? "line" : "lines"}`;
}

/**
 * Resolve the leading status glyph for a given tool-call status. The
 * `running` case is supplied by the caller because it animates via
 * {@link useToolSpinner}; the static glyphs live here so the row
 * estimator can use them without subscribing to the spinner.
 */
export function staticGlyphForStatus(
  status: Exclude<ToolCallViewStatus, "running">,
): string {
  return status === "completed"
    ? TOOL_CALL_GLYPH_COMPLETED
    : TOOL_CALL_GLYPH_ERROR;
}
