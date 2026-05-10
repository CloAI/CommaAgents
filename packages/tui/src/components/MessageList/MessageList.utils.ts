import wrap from "word-wrap";

import type { ChatMessage, MessageSegment } from "../../hooks/useChat/useChat.types";
import { truncatePreview } from "./AgentMessage/AgentMessage";

/**
 * Top + bottom border rows contributed by `BorderedPanel`'s frame.
 *
 * The panel uses Ink's built-in `borderStyle: "round"`, which always
 * draws both border rows even when the body is empty (verified via
 * `ink-testing-library` probe).
 */
const PANEL_FRAME_ROWS = 2;

/**
 * Outer-container `marginBottom` (= `spacing.xs` = 1) on every
 * non-system message. In Ink/Yoga column flow this margin renders as a
 * real row of vertical space between consecutive messages.
 *
 * `ScrollableView` sums `getRowHeight` to derive `totalRows`, so we
 * include this row in every message's height — over-counting the last
 * message by 1 row is acceptable (and matches `ScrollableView`'s
 * convention that items account for their own margins).
 */
const MESSAGE_BOTTOM_MARGIN_ROWS = 1;

/**
 * `marginTop` rows applied by the segment's own theme container. From
 * `MessageList.theme.ts`:
 *
 * - `text`        — no container, no marginTop ⇒ 0 rows
 * - `tool-call`   — `marginTop: spacing.xs` ⇒ 1 row
 * - `tool-result` — `marginTop: spacing.xs` ⇒ 1 row
 * - `thinking`    — `marginTop: spacing.xs` ⇒ 1 row
 * - `mcp-call`    — `marginTop: spacing.xs` ⇒ 1 row
 *
 * Critically, the margin is on each segment's *own* `Box`, so it
 * applies even when the segment is the first child of the panel — Yoga
 * still emits the leading row. This was verified empirically; an early
 * `index > 0` heuristic in this file under-counted single-segment
 * agent messages by exactly 1 row.
 */
function segmentMarginTopRows(segment: MessageSegment): number {
  switch (segment.type) {
    case "text":
      return 0;
    case "tool-call":
    case "tool-result":
    case "thinking":
    case "mcp-call":
      return 1;
    default:
      return 0;
  }
}

/**
 * Total horizontal chrome (in columns) consumed around message body
 * text. Subtracted from `viewportWidth` to get the wrap width:
 *
 * - `BorderedPanel.container.borderStyle = "round"` ⇒ 2 columns (left + right)
 * - `BorderedPanel.container.paddingX  = spacing.sm = 1` ⇒ 2 columns
 *
 * `MessageList`'s outer `paddingX: spacing.sm = 1` is **not** included
 * here because it lives outside the `ScrollableView` viewport — the
 * `viewportWidth` reported to `getRowHeight` already excludes it.
 *
 * Must stay in sync with `BorderedPanel.theme.ts`.
 */
const PANEL_HORIZONTAL_CHROME = 4;

/**
 * Floor for the wrap width so we never call `word-wrap` with a
 * non-positive width (which would otherwise loop forever inside the
 * library's tokenizer).
 */
const MIN_WRAP_WIDTH = 1;

/**
 * Estimate the number of terminal rows a `ChatMessage` will occupy when
 * rendered by {@link MessageList}.
 *
 * The estimate is computed against the *exact* same content the
 * renderer will draw (truncated tool-call args, hard-newline-split body
 * text, soft-wrapped to the available content width via the same
 * `word-wrap` package `TextAreaInput` uses), so the result matches
 * Ink's actual output for ASCII text without zero-width or wide
 * glyphs. The accuracy was verified by a render-anchored test that
 * compares the estimator against `ink-testing-library`'s rendered
 * frame — see `MessageList.utils.test.tsx`.
 *
 * @param message - The chat message whose rendered height we want.
 * @param viewportWidth - Measured viewport width in columns. When 0
 *   (pre-layout — `ScrollableView` reports 0 before its first measure
 *   commit), wrapping is disabled and we count only hard newlines.
 * @returns A non-negative integer row count.
 */
export function estimateMessageRowHeight(
  message: ChatMessage,
  viewportWidth: number,
): number {
  // System messages currently render as `null` (see `MessageList.tsx`),
  // so they must contribute 0 rows of scroll geometry. Returning 0 keeps
  // `ScrollableView`'s `totalRows` accurate even if a system message
  // sneaks into the list.
  if (message.role === "system") return 0;

  const wrapWidth = Math.max(
    MIN_WRAP_WIDTH,
    viewportWidth - PANEL_HORIZONTAL_CHROME,
  );

  if (message.role === "user") {
    const bodyRows = countWrappedLines(message.text, wrapWidth);
    return PANEL_FRAME_ROWS + bodyRows + MESSAGE_BOTTOM_MARGIN_ROWS;
  }

  // role === "agent"
  const segments: readonly MessageSegment[] =
    message.segments && message.segments.length > 0
      ? message.segments
      : [{ type: "text", text: message.text, streaming: message.streaming }];

  let bodyRows = 0;
  for (const segment of segments) {
    bodyRows += segmentMarginTopRows(segment);
    bodyRows += estimateSegmentBodyRows(segment, wrapWidth);
  }
  return PANEL_FRAME_ROWS + bodyRows + MESSAGE_BOTTOM_MARGIN_ROWS;
}

/**
 * Rows contributed by a single agent segment's *body* — i.e. the rows
 * inside the segment's own `Box`, NOT including the segment's
 * `marginTop` (caller adds that).
 *
 * Mirrors the renderer in `AgentMessage.tsx` exactly: tool-call args
 * and tool-result output are passed through `truncatePreview` (clipped
 * to 200 chars + ellipsis) before counting rows; mcp-call output is
 * NOT truncated by the renderer and so isn't truncated here either.
 */
function estimateSegmentBodyRows(segment: MessageSegment, wrapWidth: number): number {
  if (segment.type === "text") {
    // Plain text segment — just the wrapped lines; no header.
    return countWrappedLines(segment.text, wrapWidth);
  }
  if (segment.type === "thinking") {
    // 1 row for the "thinking" header + the wrapped body text.
    return 1 + countWrappedLines(segment.text, wrapWidth);
  }
  if (segment.type === "tool-call") {
    // 1 row for the "→ tool <name>" header + the wrapped, truncated args.
    return 1 + countWrappedLines(truncatePreview(segment.args), wrapWidth);
  }
  if (segment.type === "tool-result") {
    // 1 row for the "← <name> result" header + the wrapped, truncated output.
    return 1 + countWrappedLines(truncatePreview(segment.output), wrapWidth);
  }
  if (segment.type === "mcp-call") {
    // 1 row for the "→ mcp <server> <tool>" header
    //   + wrapped, truncated args
    //   + wrapped (untruncated) output, when present.
    const argsRows = countWrappedLines(truncatePreview(segment.args), wrapWidth);
    const outputRows =
      segment.output !== undefined ? countWrappedLines(segment.output, wrapWidth) : 0;
    return 1 + argsRows + outputRows;
  }
  // Unknown / future segment kinds — contribute one row so the list
  // still advances even if a new variant slips through at runtime.
  return 1;
}

/**
 * Count the rows produced by soft-wrapping `text` to `width` columns,
 * matching the way the renderer draws Ink `<Text wrap="wrap">` content
 * **inside `BorderedPanel`** — every message body in `MessageList` is
 * wrapped in a bordered panel, which changes the trim rules vs. a
 * plain unbordered `<Box>`.
 *
 * Ink-specific behaviors observed and accounted for:
 *
 * 1. An empty body (`""`) renders **zero** rows — the renderer never
 *    emits a `<Text>` element, so there is no row to draw. Earlier
 *    versions of this estimator returned 1 "for safety", which
 *    over-counted empty messages by 1 row.
 * 2. Inside a bordered panel, trailing newlines are **NOT** trimmed:
 *    `"hello\n"` renders 2 body rows ("hello" + blank), `"a\nb\n"`
 *    renders 3 rows. (In an unbordered `<Box>` Ink does trim, but
 *    every body in `MessageList` lives inside `BorderedPanel`.)
 * 3. Internal blank lines are preserved, exactly as expected.
 *
 * Per-line wrapping is delegated to `word-wrap`, the same library
 * `TextAreaInput` uses, so the visible output and the measured height
 * come from the same algorithm. `word-wrap` strips trailing newlines
 * from its input, which is why we split on `\n` first and wrap each
 * hard-break segment independently — passing the whole value would
 * collapse blank rows.
 */
function countWrappedLines(text: string, width: number): number {
  if (text.length === 0) return 0;

  // Match TextAreaInput's normalization so wrap counts agree even when
  // input contains CRLF or stray CR characters.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let total = 0;
  for (const segment of normalized.split("\n")) {
    if (segment.length === 0) {
      // Blank line (internal or trailing) — renders as a one-row gap
      // inside the bordered panel.
      total += 1;
      continue;
    }
    const wrapped = wrap(segment, {
      width,
      newline: "\n",
      indent: "",
    });
    total += wrapped.split("\n").length;
  }
  return total;
}
