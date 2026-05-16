import CliTable3 from "cli-table3";
import { lexer } from "marked";

import {
  THINKING_ELLIPSIS_LINE,
  THINKING_TRUNCATION_LINE_COUNT,
} from "./MarkdownView.constants";
import type { MdBlock, MdInline, MdListItem } from "./MarkdownView.types";

/* ------------------------------------------------------------------ *
 *  Markdown tokenization
 * ------------------------------------------------------------------ */

/**
 * Convert raw Markdown source into our normalized
 * {@link MdBlock} tree.
 *
 * `marked` is invoked in lexer-only mode — we never call `marked.parse`
 * because we don't want HTML output, we want a renderable AST. Unknown
 * or unsupported token types collapse into a paragraph containing
 * their `raw` text so nothing is silently dropped from the rendered
 * message.
 *
 * The function is pure and synchronous — same input always produces
 * the same output. It's safe to invoke on every render even while a
 * segment is streaming because `marked.lexer` is fast (microseconds
 * for typical chat messages) and auto-closes incomplete fenced blocks
 * by emitting them as code tokens.
 */
export function tokenizeMarkdown(source: string): readonly MdBlock[] {
  if (source.length === 0) return [];
  const tokens = lexer(source);
  const blocks: MdBlock[] = [];
  for (const token of tokens) {
    const block = blockFromMarkedToken(token);
    if (block !== null) blocks.push(block);
  }
  return blocks;
}

/* ------------------------------------------------------------------ *
 *  Internal converters
 * ------------------------------------------------------------------ */

/**
 * `marked`'s public `Token` type is a giant discriminated union that's
 * tedious to import piecewise; this internal alias keeps the converter
 * readable without leaking the dependency through our types.
 */
// biome-ignore lint/suspicious/noExplicitAny: marked's token shape is intentionally narrow at use sites.
type MarkedToken = any;

function blockFromMarkedToken(token: MarkedToken): MdBlock | null {
  switch (token.type as string) {
    case "space":
      // A run of blank lines between blocks. We don't model these
      // explicitly — the renderer puts a single blank row between
      // adjacent blocks of its own accord. Returning null drops the
      // token from the output stream.
      return null;
    case "paragraph":
      return {
        kind: "paragraph",
        children: inlinesFromTokens(token.tokens ?? []),
      };
    case "heading":
      return {
        kind: "heading",
        depth: clampHeadingDepth(token.depth),
        children: inlinesFromTokens(token.tokens ?? []),
      };
    case "list":
      return {
        kind: "list",
        ordered: Boolean(token.ordered),
        start:
          typeof token.start === "number" && Number.isFinite(token.start)
            ? token.start
            : 1,
        items: (token.items ?? []).map((item: MarkedToken): MdListItem => {
          // `marked` normalises list-item content into a flat token
          // stream that mixes inline tokens with nested blocks (e.g. a
          // sublist). We split them: inline tokens contribute to the
          // item's first line, block tokens become nested blocks.
          const inlineSpans: MdInline[] = [];
          const nestedBlocks: MdBlock[] = [];
          for (const child of item.tokens ?? []) {
            if (isInlineLikeToken(child)) {
              // `text` items inside a list arrive with a recursive
              // `tokens` array of the actual inline spans.
              const grandchildren = (child as MarkedToken).tokens;
              if (Array.isArray(grandchildren) && grandchildren.length > 0) {
                inlineSpans.push(...inlinesFromTokens(grandchildren));
              } else {
                inlineSpans.push(...inlinesFromTokens([child]));
              }
              continue;
            }
            const nested = blockFromMarkedToken(child);
            if (nested !== null) nestedBlocks.push(nested);
          }
          return { children: inlineSpans, nested: nestedBlocks };
        }),
      };
    case "blockquote":
      return {
        kind: "blockquote",
        children: ((token.tokens ?? []) as MarkedToken[])
          .map(blockFromMarkedToken)
          .filter((b): b is MdBlock => b !== null),
      };
    case "code":
      return {
        kind: "code",
        value: typeof token.text === "string" ? token.text : "",
        language: typeof token.lang === "string" ? token.lang : "",
      };
    case "table":
      return {
        kind: "table",
        header: (token.header ?? []).map((cell: MarkedToken) =>
          inlinesFromTokens(cell.tokens ?? []),
        ),
        rows: (token.rows ?? []).map((row: MarkedToken[]) =>
          row.map((cell) => inlinesFromTokens(cell.tokens ?? [])),
        ),
      };
    case "hr":
      return { kind: "hr" };
    default: {
      // Unknown / unsupported token — degrade gracefully by rendering
      // its raw text as a paragraph so nothing is silently lost. Long
      // term we'd add explicit handling, but it's better to surface
      // unknown content than to drop it.
      const raw = typeof token.raw === "string" ? token.raw : "";
      if (raw.length === 0) return null;
      return {
        kind: "paragraph",
        children: [{ kind: "text", value: raw }],
      };
    }
  }
}

function inlinesFromTokens(
  tokens: readonly MarkedToken[],
): readonly MdInline[] {
  const out: MdInline[] = [];
  for (const token of tokens) {
    // `text` tokens with their own `tokens` array are bare wrappers
    // around a stream of real inline children — flatten them in place
    // rather than emitting a (lossy) single span. This shape appears
    // in nested list items where `marked` double-wraps content.
    if (
      (token.type as string) === "text" &&
      Array.isArray(token.tokens) &&
      token.tokens.length > 0
    ) {
      out.push(...inlinesFromTokens(token.tokens));
      continue;
    }
    const span = inlineFromMarkedToken(token);
    if (span !== null) out.push(span);
  }
  return out;
}

function inlineFromMarkedToken(token: MarkedToken): MdInline | null {
  switch (token.type as string) {
    case "text":
      // Wrapper `text` tokens with nested children are flattened
      // upstream in {@link inlinesFromTokens}; by the time we reach
      // here the token is always a plain leaf.
      return {
        kind: "text",
        value: typeof token.text === "string" ? token.text : "",
      };
    case "strong":
      return {
        kind: "strong",
        children: inlinesFromTokens(token.tokens ?? []),
      };
    case "em":
      return {
        kind: "em",
        children: inlinesFromTokens(token.tokens ?? []),
      };
    case "codespan":
      return {
        kind: "code",
        value: typeof token.text === "string" ? token.text : "",
      };
    case "link":
      return {
        kind: "link",
        text:
          typeof token.text === "string"
            ? token.text
            : typeof token.raw === "string"
              ? token.raw
              : "",
        href: typeof token.href === "string" ? token.href : "",
      };
    case "br":
      return { kind: "text", value: "\n" };
    case "del":
      // `~~strikethrough~~` is a GFM extension; we render as plain
      // text rather than supporting it natively for now. Folding into
      // the children stream keeps content visible.
      return {
        kind: "text",
        value: typeof token.text === "string" ? token.text : "",
      };
    default: {
      const raw = typeof token.raw === "string" ? token.raw : "";
      if (raw.length === 0) return null;
      return { kind: "text", value: raw };
    }
  }
}

/**
 * Whether a `marked` child token belongs in a list-item's inline
 * stream (becomes part of the item's flowing first line) vs its nested
 * block stream (rendered indented under the item, e.g. a sublist).
 */
function isInlineLikeToken(token: MarkedToken): boolean {
  const t = token.type as string;
  return (
    t === "text" ||
    t === "strong" ||
    t === "em" ||
    t === "codespan" ||
    t === "link" ||
    t === "br" ||
    t === "del"
  );
}

function clampHeadingDepth(depth: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  const n =
    typeof depth === "number" && Number.isFinite(depth) ? Math.trunc(depth) : 1;
  const clamped = Math.max(1, Math.min(6, n));
  return clamped as 1 | 2 | 3 | 4 | 5 | 6;
}

/* ------------------------------------------------------------------ *
 *  Inline → plain text (for tables, row estimator, snapshots)
 * ------------------------------------------------------------------ */

/**
 * Flatten an inline span tree into its plain-text content.
 *
 * Used for:
 * - table cells, where `cli-table3` measures column widths against the
 *   plain content (style escapes break its width math);
 * - the row-height estimator, which counts wrapped widths against the
 *   same characters the renderer will draw.
 *
 * Links are rendered as `text (url)` to match the inline renderer's
 * decision (see {@link MarkdownViewProps}).
 */
export function inlineSpansToPlainText(spans: readonly MdInline[]): string {
  let out = "";
  for (const span of spans) {
    switch (span.kind) {
      case "text":
        out += span.value;
        break;
      case "strong":
      case "em":
        out += inlineSpansToPlainText(span.children);
        break;
      case "code":
        out += span.value;
        break;
      case "link":
        out += span.href.length > 0 ? `${span.text} (${span.href})` : span.text;
        break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  Tables → cli-table3 ASCII art
 * ------------------------------------------------------------------ */

/**
 * Render a parsed Markdown table to a single ASCII string suitable for
 * a single Ink `<Text>` element. Column widths and borders are
 * delegated to `cli-table3` which sizes each column to its widest
 * cell. The output is plain (no shell colours) so Ink's line-wrap
 * stays accurate.
 */
export function renderTableToText(
  header: readonly (readonly MdInline[])[],
  rows: readonly (readonly (readonly MdInline[])[])[],
): string {
  const headerStrings = header.map((cell) => inlineSpansToPlainText(cell));
  const table = new CliTable3({
    head: [...headerStrings],
    style: { head: [], border: [] },
  });
  for (const row of rows) {
    table.push(row.map((cell) => inlineSpansToPlainText(cell)));
  }
  return table.toString();
}

/* ------------------------------------------------------------------ *
 *  Thinking-segment truncation
 * ------------------------------------------------------------------ */

/**
 * Truncate `text` to its last {@link THINKING_TRUNCATION_LINE_COUNT}
 * lines, prepending an ellipsis line to indicate truncation occurred.
 *
 * Operates on already-rendered lines (i.e. post-Markdown layout). When
 * the input has fewer lines than the cap the original string is
 * returned unchanged so short reasoning passes don't grow an extra
 * marker line.
 *
 * Pure — no allocation when the input fits.
 */
export function truncateToLastNLines(text: string, lineCount: number): string {
  if (lineCount < 1) return text;
  // Normalise CRLF so the slice works the same on Windows-typed pastes.
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalised.split("\n");
  if (lines.length <= lineCount) return normalised;
  const tail = lines.slice(lines.length - lineCount);
  return [THINKING_ELLIPSIS_LINE, ...tail].join("\n");
}

/**
 * Convenience wrapper around {@link truncateToLastNLines} bound to the
 * Phase-2 default cap. Exists so call sites read declaratively
 * (`truncateThinking(text)`) and the constant stays a single source
 * of truth.
 */
export function truncateThinking(text: string): string {
  return truncateToLastNLines(text, THINKING_TRUNCATION_LINE_COUNT);
}
