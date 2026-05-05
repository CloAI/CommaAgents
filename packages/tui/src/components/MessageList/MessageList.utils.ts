import type { ChatMessage, MessageSegment } from "../../hooks/useChat/useChat.types";

/**
 * Vertical row count contributed by a `BorderedPanel`'s frame chrome
 * (top header line + bottom border).
 */
const PANEL_FRAME_ROWS = 2;

/**
 * Bottom spacer applied between consecutive messages via the theme's
 * `marginBottom: spacing.xs` (= 1 row in the default theme).
 */
const MESSAGE_BOTTOM_SPACER_ROWS = 1;

/**
 * Top spacer applied to every non-first agent body segment via the theme's
 * `marginTop: spacing.xs` (= 1 row in the default theme).
 */
const SEGMENT_TOP_SPACER_ROWS = 1;

/**
 * Maximum truncated tool-call args preview length (single visual line).
 *
 * Mirrors the constant in `AgentMessage.tsx` so estimates stay in sync; if
 * the renderer's truncation rule changes, update both.
 */
const TOOL_ARGS_PREVIEW_ROWS = 1;

/**
 * Estimate the number of terminal rows a `ChatMessage` will occupy when
 * rendered by {@link MessageList}.
 *
 * The estimate is intentionally crude: it counts hard line breaks plus a
 * small amount of per-segment chrome (panel borders, segment headers,
 * inter-segment spacing). It does **not** measure soft-wrap, because
 * `MessageList` doesn't know its own viewport width here. The result is
 * good enough for `ScrollableView` to size its scrollbar thumb roughly in
 * proportion to actual on-screen content; absolute pixel correctness is
 * not required.
 *
 * @param message - The chat message whose rendered height we want to
 *   estimate.
 * @returns A non-negative integer row count, always at least 1.
 */
export function estimateMessageRowHeight(message: ChatMessage): number {
  if (message.role === "user") {
    return PANEL_FRAME_ROWS + countLines(message.text) + MESSAGE_BOTTOM_SPACER_ROWS;
  }

  if (message.role === "agent") {
    const segments: readonly MessageSegment[] =
      message.segments && message.segments.length > 0
        ? message.segments
        : [{ type: "text", text: message.text, streaming: message.streaming }];

    let rows = PANEL_FRAME_ROWS;
    segments.forEach((segment, index) => {
      if (index > 0) rows += SEGMENT_TOP_SPACER_ROWS;
      rows += estimateSegmentRowHeight(segment);
    });
    return rows + MESSAGE_BOTTOM_SPACER_ROWS;
  }

  // System messages currently render as nothing (see MessageList.tsx);
  // returning 0 keeps the scroll geometry accurate — a null render
  // contributes no rows to the viewport.
  return 0;
}

/** Estimate the row count for a single agent body segment. */
function estimateSegmentRowHeight(segment: MessageSegment): number {
  if (segment.type === "text") {
    return countLines(segment.text);
  }
  if (segment.type === "thinking") {
    // 1 row for the "thinking" header + the body text.
    return 1 + countLines(segment.text);
  }
  if (segment.type === "tool-call") {
    // 1 row for the header line + 1 row for the truncated args preview.
    return 1 + TOOL_ARGS_PREVIEW_ROWS;
  }
  if (segment.type === "tool-result") {
    // 1 row for the header + the output body.
    return 1 + countLines(segment.output);
  }
  if (segment.type === "mcp-call") {
    // 1 row for the header + 1 for args; output, when present, adds its body.
    const outputRows = segment.output !== undefined ? countLines(segment.output) : 0;
    return 1 + TOOL_ARGS_PREVIEW_ROWS + outputRows;
  }
  // Unknown / future segment kinds — assume one row so the list still
  // advances even if a new variant slips through at runtime.
  return 1;
}

/**
 * Count the number of hard newline-separated lines in `text`.
 *
 * Empty strings still count as a single line because the renderer always
 * emits at least one row for the surrounding `<Text>`.
 */
function countLines(text: string): number {
  if (text.length === 0) return 1;
  // `split("\n")` always returns at least one element.
  return text.split("\n").length;
}
