import wrap from "word-wrap";

import type {
  ChatMessage,
  MessageSegment,
} from "../../hooks/useChat/useChat.types";
import { TOOL_SPINNER_FRAMES } from "../../hooks/useToolSpinner";
import { truncatePreview } from "./AgentMessage/AgentMessage";
import type { MdBlock, MdListItem } from "./MarkdownView";
import {
  inlineSpansToPlainText,
  LIST_INDENT_PER_LEVEL,
  renderTableToText,
  tokenizeMarkdown,
  truncateThinking,
  UNORDERED_LIST_BULLET,
} from "./MarkdownView";
import {
  formatArgsPreview,
  formatResultSummary,
  staticGlyphForStatus,
} from "./ToolCallView/index";

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
 * `MessageList.theme.ts` and `ToolCallView.theme.ts`:
 *
 * - `text`        — no container, no marginTop ⇒ 0 rows
 * - `tool-call`   — `marginTop: spacing.xs` ⇒ 1 row (rendered via
 *                   `ToolCallView` whose container applies the same
 *                   `spacing.xs` top margin as the legacy two-row
 *                   layout, so this entry stays 1 even after the
 *                   collapsed-row refactor).
 * - `tool-result` — `marginTop: spacing.xs` ⇒ 1 row (only counted for
 *                   *orphan* results that don't pair with a preceding
 *                   `tool-call`; paired results contribute 0 rows
 *                   because they render inside the call's row).
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

  // Build the same `toolCallId → tool-result` index the renderer uses
  // (see `AgentMessageRender` in `AgentMessage.tsx`) so we can:
  //   1. Render each `tool-call` row with its trailing `→ N lines`
  //      summary baked into the wrapped width calculation.
  //   2. Skip *paired* `tool-result` segments entirely — they render
  //      as part of the call's row and contribute 0 standalone rows.
  // Orphan tool-results (no matching call in the same message) still
  // count via the legacy two-row layout to match the renderer.
  const toolCallIds = new Set<string>();
  const resultsByCallId = new Map<
    string,
    Extract<MessageSegment, { readonly type: "tool-result" }>
  >();
  for (const segment of segments) {
    if (segment.type === "tool-call") {
      toolCallIds.add(segment.toolCallId);
    } else if (segment.type === "tool-result") {
      resultsByCallId.set(segment.toolCallId, segment);
    }
  }

  let bodyRows = 0;
  for (const segment of segments) {
    if (segment.type === "tool-result" && toolCallIds.has(segment.toolCallId)) {
      // Paired result — fully accounted for by its tool-call row.
      continue;
    }
    bodyRows += segmentMarginTopRows(segment);
    bodyRows += estimateSegmentBodyRows(segment, wrapWidth, resultsByCallId);
  }
  return PANEL_FRAME_ROWS + bodyRows + MESSAGE_BOTTOM_MARGIN_ROWS;
}

/**
 * Rows contributed by a single agent segment's *body* — i.e. the rows
 * inside the segment's own `Box`, NOT including the segment's
 * `marginTop` (caller adds that).
 *
 * Mirrors the renderer in `AgentMessage.tsx` exactly:
 *
 * - `tool-call`: rendered as ONE wrapped logical row composed of
 *   `<glyph> <toolName> <argsPreview>  <resultSummary>`. We rebuild the
 *   exact string `ToolCallView` will draw (using `formatArgsPreview`,
 *   `formatResultSummary`, and the static glyph for the resolved
 *   status — the spinner glyph is one cell wide so its substitution
 *   doesn't change wrap counts) and pass it through `countWrappedLines`.
 * - `tool-result` (orphan only — paired results are filtered out by
 *   the caller): legacy two-row layout (header + wrapped output).
 * - `thinking`, `text`, `mcp-call`: unchanged from the pre-Phase-1
 *   layout.
 */
function estimateSegmentBodyRows(
  segment: MessageSegment,
  wrapWidth: number,
  resultsByCallId: ReadonlyMap<
    string,
    Extract<MessageSegment, { readonly type: "tool-result" }>
  >,
): number {
  if (segment.type === "text") {
    // Plain text segments are rendered through `MarkdownView`; we
    // mirror that geometry by tokenising and summing per-block rows.
    return estimateMarkdownRows(segment.text, wrapWidth);
  }
  if (segment.type === "thinking") {
    // 1 row for the "thinking" header + the truncated, Markdown-
    // rendered body.
    return 1 + estimateMarkdownRows(truncateThinking(segment.text), wrapWidth);
  }
  if (segment.type === "tool-call") {
    const pairedResult = resultsByCallId.get(segment.toolCallId);
    const status = pairedResult === undefined ? "running" : pairedResult.status;
    // Substitute a static glyph for the spinner — both are single-cell
    // wide so the wrap count is identical regardless of which animation
    // frame happens to be rendered when the layout is measured.
    const glyph =
      status === "running"
        ? TOOL_SPINNER_FRAMES[0]
        : staticGlyphForStatus(status);
    const argsPreview = formatArgsPreview(segment.args);
    const resultSummary = formatResultSummary(
      status,
      pairedResult?.output,
      pairedResult?.error,
    );
    // Reproduce the renderer's spacing exactly: single space after the
    // glyph and tool name; double space before the result summary
    // (matches the `<Text>  </Text>` separator in `ToolCallView`).
    let line = `${glyph} ${segment.toolName}`;
    if (argsPreview.length > 0) line += ` ${argsPreview}`;
    if (resultSummary.length > 0) line += `  ${resultSummary}`;
    return countWrappedLines(line, wrapWidth);
  }
  if (segment.type === "tool-result") {
    // Orphan tool-result — legacy two-row layout (header + wrapped,
    // truncated output). Paired results are filtered upstream.
    return 1 + countWrappedLines(truncatePreview(segment.output), wrapWidth);
  }
  if (segment.type === "mcp-call") {
    // 1 row for the "→ mcp <server> <tool>" header
    //   + wrapped, truncated args
    //   + wrapped (untruncated) output, when present.
    const argsRows = countWrappedLines(
      truncatePreview(segment.args),
      wrapWidth,
    );
    const outputRows =
      segment.output !== undefined
        ? countWrappedLines(segment.output, wrapWidth)
        : 0;
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

/**
 * Estimate the row count of a Markdown-rendered body to mirror what
 * {@link import("./MarkdownView").MarkdownView} draws.
 *
 * The function tokenises the source the same way the renderer does
 * and walks each top-level block, summing per-block heights. Inline
 * formatting is collapsed to its plain-text projection (via
 * {@link inlineSpansToPlainText}) for wrapping calculations because
 * style escapes don't widen the visible cell count, and that's what
 * Ink measures against. This means the estimate is exact for plain
 * prose and a close upper-bound for content that fits within the
 * blocks we model.
 */
function estimateMarkdownRows(source: string, wrapWidth: number): number {
  if (source.length === 0) return 0;
  const blocks = tokenizeMarkdown(source);
  let total = 0;
  for (const block of blocks) {
    total += estimateMarkdownBlockRows(block, wrapWidth);
  }
  return total;
}

function estimateMarkdownBlockRows(block: MdBlock, wrapWidth: number): number {
  switch (block.kind) {
    case "paragraph":
      return countWrappedLines(
        inlineSpansToPlainText(block.children),
        wrapWidth,
      );
    case "heading": {
      // The renderer prefixes the heading with `<#…> ` so the column
      // budget shrinks by that fixed amount before wrapping.
      const prefixWidth = block.depth + 1;
      const text = inlineSpansToPlainText(block.children);
      return countWrappedLines(
        text,
        Math.max(MIN_WRAP_WIDTH, wrapWidth - prefixWidth),
      );
    }
    case "list":
      return estimateListRows(
        block.items,
        block.ordered,
        block.start,
        wrapWidth,
        0,
      );
    case "blockquote": {
      // Each child paragraph keeps its line count (`│ ` prefix is
      // applied per source line). Other nested blocks recurse.
      let total = 0;
      const markerWidth = 2; /* `│ ` */
      for (const child of block.children) {
        if (child.kind === "paragraph") {
          const text = inlineSpansToPlainText(child.children);
          total += countWrappedLines(
            text,
            Math.max(MIN_WRAP_WIDTH, wrapWidth - markerWidth),
          );
        } else {
          total += estimateMarkdownBlockRows(child, wrapWidth - markerWidth);
        }
      }
      return total;
    }
    case "code":
      // CodeView wraps each source line in its own row; line numbers
      // are off in our embed so the row count equals the source's
      // line count (an empty line from a trailing newline counts).
      return block.value.length === 0 ? 1 : block.value.split("\n").length;
    case "table": {
      // cli-table3 emits a fixed border layout: one top border row,
      // one header row, one separator, then 2 rows per data row
      // (content + separator), and finally a closing border row.
      // Easiest exact count: render and split.
      const text = renderTableToText(block.header, block.rows);
      return text.split("\n").length;
    }
    case "hr":
      return 1;
  }
}

function estimateListRows(
  items: readonly MdListItem[],
  ordered: boolean,
  start: number,
  wrapWidth: number,
  depth: number,
): number {
  // Mirror the renderer's per-row marker layout:
  //   [indent][marker][space][content]
  const indent = depth * LIST_INDENT_PER_LEVEL;
  const markerWidth = ordered
    ? String(start + items.length - 1).length + 1 /* trailing dot */
    : UNORDERED_LIST_BULLET.length;
  const contentWidth = Math.max(
    MIN_WRAP_WIDTH,
    wrapWidth - indent - markerWidth - 1 /* gap */,
  );

  let total = 0;
  for (const item of items) {
    total += countWrappedLines(
      inlineSpansToPlainText(item.children),
      contentWidth,
    );
    for (const nested of item.nested) {
      if (nested.kind === "list") {
        total += estimateListRows(
          nested.items,
          nested.ordered,
          nested.start,
          wrapWidth,
          depth + 1,
        );
      } else {
        total += estimateMarkdownBlockRows(nested, contentWidth);
      }
    }
  }
  return total;
}
