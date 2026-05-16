import { Box, Text } from "ink";
import type React from "react";

import { useDebugRender } from "../../../hooks/useDebugRender";
import { CodeView } from "../../CodeView";
import {
  BLOCKQUOTE_PREFIX,
  HEADING_PREFIX_CHAR,
  HORIZONTAL_RULE_CHAR,
  HORIZONTAL_RULE_DEFAULT_WIDTH,
  LIST_INDENT_PER_LEVEL,
  UNORDERED_LIST_BULLET,
} from "./MarkdownView.constants";
import type { MarkdownViewTheme } from "./MarkdownView.theme";
import { useMarkdownViewTheme } from "./MarkdownView.theme";
import type {
  FencedLanguage,
  MarkdownViewProps,
  MarkdownViewRenderProps,
  MdBlock,
  MdInline,
  MdListItem,
} from "./MarkdownView.types";
import {
  inlineSpansToPlainText,
  renderTableToText,
  tokenizeMarkdown,
} from "./MarkdownView.utils";

/**
 * Render a Markdown source string as themed Ink elements.
 *
 * Lex-and-render: the source is re-tokenised on every render so
 * streaming agent output (which appends to the same string between
 * frames) renders as soon as new tokens close. `marked` auto-finalises
 * unfinished fences/lists, so partial output never visually corrupts —
 * the worst case is a paragraph that flips into a code-block once the
 * trailing fence arrives.
 *
 * Component is intentionally render-pure beyond the lex step so the
 * row-height estimator in `MessageList.utils.ts` can call the same
 * tokeniser and reproduce the renderer's wrap counts.
 */
export function MarkdownView({
  markdown,
  width,
}: MarkdownViewProps): React.ReactElement {
  useDebugRender("MarkdownView", { props: { markdown, width } });
  const theme = useMarkdownViewTheme();
  const blocks = tokenizeMarkdown(markdown);
  const effectiveWidth =
    typeof width === "number" && width > 0
      ? width
      : HORIZONTAL_RULE_DEFAULT_WIDTH;
  return (
    <MarkdownViewRender blocks={blocks} theme={theme} width={effectiveWidth} />
  );
}

/**
 * Pure render half of {@link MarkdownView}.
 *
 * Split out so unit tests can drive the renderer with a hand-crafted
 * block tree and a stub theme without having to round-trip through the
 * `marked` lexer. Same pattern as
 * {@link import("../../CodeView").CodeViewRender} and
 * {@link import("../ToolCallView").ToolCallViewRender}.
 */
export function MarkdownViewRender({
  blocks,
  theme,
  width,
}: MarkdownViewRenderProps): React.ReactElement {
  return (
    <Box {...theme.root}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} theme={theme} width={width} />
      ))}
    </Box>
  );
}

interface BlockViewProps {
  readonly block: MdBlock;
  readonly theme: MarkdownViewTheme;
  readonly width: number;
}

/**
 * Dispatch a single {@link MdBlock} to the appropriate sub-renderer.
 *
 * Implemented as a switch on `kind` rather than a per-kind component
 * so the dispatch table is co-located with the renderer (easier to
 * add a new block type without sprinkling files around) and so a new
 * member of the discriminated union surfaces as a TypeScript error
 * here.
 */
function BlockView({
  block,
  theme,
  width,
}: BlockViewProps): React.ReactElement | null {
  switch (block.kind) {
    case "paragraph":
      return (
        <Box {...theme.paragraph}>
          <Text {...theme.paragraphText}>
            <InlineRun spans={block.children} theme={theme} />
          </Text>
        </Box>
      );
    case "heading":
      return (
        <Box {...theme.paragraph}>
          <Text>
            <Text {...theme.headingPrefix}>
              {`${HEADING_PREFIX_CHAR.repeat(block.depth)} `}
            </Text>
            <Text {...theme.heading}>
              <InlineRun spans={block.children} theme={theme} />
            </Text>
          </Text>
        </Box>
      );
    case "list":
      return (
        <ListView
          ordered={block.ordered}
          start={block.start}
          items={block.items}
          theme={theme}
          width={width}
          depth={0}
        />
      );
    case "blockquote":
      // Render every wrapped/hard-break line with a leading `│ ` so
      // long quotes stay visually anchored. We can only project this
      // accurately for paragraph children (the common case) — nested
      // blocks (e.g. a code fence inside a blockquote) recurse into
      // BlockView and pick up the marker on their first line only.
      // That's good enough for chat output where multi-paragraph
      // blockquotes are rare.
      return (
        <Box {...theme.blockquote}>
          {block.children.map((child, index) => {
            if (child.kind === "paragraph") {
              const plain = inlineSpansToPlainText(child.children);
              const lines = plain.split("\n");
              return (
                <Box key={index} flexDirection="column">
                  {lines.map((line, lineIndex) => (
                    <Text key={lineIndex} {...theme.paragraphText}>
                      <Text {...theme.blockquoteMarker}>
                        {BLOCKQUOTE_PREFIX}
                      </Text>
                      <Text>{line}</Text>
                    </Text>
                  ))}
                </Box>
              );
            }
            return (
              <Box key={index} flexDirection="row">
                <Text {...theme.blockquoteMarker}>{BLOCKQUOTE_PREFIX}</Text>
                <Box flexDirection="column" flexGrow={1}>
                  <BlockView block={child} theme={theme} width={width} />
                </Box>
              </Box>
            );
          })}
        </Box>
      );
    case "code":
      return (
        <CodeView
          code={block.value}
          // CodeView's TS prop is a strict shiki language union; the
          // component falls back to plain text at runtime when the lang
          // isn't recognised, so we cast to keep unsupported fence
          // identifiers from breaking the type-check.
          language={(block.language || "text") as FencedLanguage}
          showLineNumbers={false}
        />
      );
    case "table":
      return (
        <Box {...theme.table}>
          <Text {...theme.tableText}>
            {renderTableToText(block.header, block.rows)}
          </Text>
        </Box>
      );
    case "hr":
      return (
        <Box {...theme.horizontalRule}>
          <Text {...theme.horizontalRuleText}>
            {HORIZONTAL_RULE_CHAR.repeat(Math.max(1, width))}
          </Text>
        </Box>
      );
  }
}

interface ListViewProps {
  readonly ordered: boolean;
  readonly start: number;
  readonly items: readonly MdListItem[];
  readonly theme: MarkdownViewTheme;
  readonly width: number;
  /** Current nesting depth — drives indent. Top-level lists pass `0`. */
  readonly depth: number;
}

function ListView({
  ordered,
  start,
  items,
  theme,
  width,
  depth,
}: ListViewProps): React.ReactElement {
  // Pre-compute the marker column width so all ordinals line up
  // (`9.` and `10.` need the same column). Bullets are always single-cell.
  const markerWidth = ordered
    ? String(start + items.length - 1).length + 1 /* trailing dot */
    : 1;
  const indent = depth * LIST_INDENT_PER_LEVEL;

  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const marker = ordered
          ? `${start + index}.`.padStart(markerWidth, " ")
          : UNORDERED_LIST_BULLET;
        return (
          <Box key={index} {...theme.listItemRow}>
            {indent > 0 ? <Box width={indent} /> : null}
            <Text {...theme.listMarker}>{marker}</Text>
            <Box width={1} />
            <Box {...theme.listItemContent} flexGrow={1}>
              <Text {...theme.paragraphText}>
                <InlineRun spans={item.children} theme={theme} />
              </Text>
              {item.nested.map((nested, nestedIndex) =>
                nested.kind === "list" ? (
                  <ListView
                    key={nestedIndex}
                    ordered={nested.ordered}
                    start={nested.start}
                    items={nested.items}
                    theme={theme}
                    width={width}
                    depth={depth + 1}
                  />
                ) : (
                  <BlockView
                    key={nestedIndex}
                    block={nested}
                    theme={theme}
                    width={width}
                  />
                ),
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

interface InlineRunProps {
  readonly spans: readonly MdInline[];
  readonly theme: MarkdownViewTheme;
}

/**
 * Flatten a stream of inline spans into nested `<Text>` style
 * fragments. Returned as a fragment so callers can drop the run
 * straight inside an outer `<Text wrap="wrap">` block.
 *
 * Ink only supports `<Text>` inside `<Text>` for inline styling — no
 * `<Box>` may appear in this subtree. That's why links render as a
 * single concatenated `text (url)` rather than two side-by-side boxes.
 */
function InlineRun({ spans, theme }: InlineRunProps): React.ReactElement {
  return (
    <>
      {spans.map((span, index) => (
        <InlineSpan key={index} span={span} theme={theme} />
      ))}
    </>
  );
}

interface InlineSpanProps {
  readonly span: MdInline;
  readonly theme: MarkdownViewTheme;
}

function InlineSpan({ span, theme }: InlineSpanProps): React.ReactElement {
  switch (span.kind) {
    case "text":
      return <Text>{span.value}</Text>;
    case "strong":
      return (
        <Text {...theme.strong}>
          <InlineRun spans={span.children} theme={theme} />
        </Text>
      );
    case "em":
      return (
        <Text {...theme.em}>
          <InlineRun spans={span.children} theme={theme} />
        </Text>
      );
    case "code":
      return <Text {...theme.inlineCode}>{`\`${span.value}\``}</Text>;
    case "link": {
      // Render `text (url)` — terminal-friendly across all emulators.
      // The text gets the link colour, the parenthetical url gets a
      // dimmer companion style. We deliberately avoid OSC-8 escape
      // codes: support is uneven and Ink's measurement code can't see
      // them so wraps would break.
      const showUrl = span.href.length > 0;
      return (
        <Text>
          <Text {...theme.linkText}>{span.text}</Text>
          {showUrl ? (
            <>
              <Text> </Text>
              <Text {...theme.linkUrl}>{`(${span.href})`}</Text>
            </>
          ) : null}
        </Text>
      );
    }
  }
}

/**
 * Convenience re-export so `AgentMessage`'s row estimator can pick up
 * the same plain-text projection the renderer uses for tables and
 * tests without depending on the utils file directly.
 */
export { inlineSpansToPlainText };
