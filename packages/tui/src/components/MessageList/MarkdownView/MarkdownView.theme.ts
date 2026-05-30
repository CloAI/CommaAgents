import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../../Theme";

/** Memoized themed style objects for the {@link MarkdownView} component. */
export const useMarkdownViewTheme = defineTheme((tokens) => ({
  /** Outer container wrapping the entire rendered document. */
  root: { flexDirection: "column" } satisfies BoxProps,
  /** Container for a paragraph block. */
  paragraph: { flexDirection: "column" } satisfies BoxProps,
  /** Container row for a single list item. */
  listItemRow: { flexDirection: "row" } satisfies BoxProps,
  /** Bullet / ordinal column at the start of a list-item row. */
  listMarker: {
    color: tokens.colors.primary,
    bold: tokens.typography.labelBold,
  } satisfies TextProps,
  /** Inner column used to stack the item's content + nested blocks. */
  listItemContent: { flexDirection: "column" } satisfies BoxProps,
  /** Container for a blockquote (vertical-bar prefix is part of every line). */
  blockquote: { flexDirection: "column" } satisfies BoxProps,
  /** Style of the leading vertical-bar marker on each blockquote line. */
  blockquoteMarker: {
    color: tokens.colors.muted,
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
  /** Heading text style; depth is applied by the renderer via the depth prefix. */
  heading: {
    bold: tokens.typography.headerBold,
    color: tokens.colors.primary,
  } satisfies TextProps,
  /** Faint heading prefix (e.g. `## `) so the depth is unambiguous. */
  headingPrefix: {
    dimColor: tokens.typography.secondaryDim,
    color: tokens.colors.muted,
  } satisfies TextProps,
  /** Inline `code` span style. */
  inlineCode: {
    color: tokens.colors.warning,
  } satisfies TextProps,
  /** Inline `[text](url)` link text style. */
  linkText: {
    color: tokens.colors.primary,
    underline: true,
  } satisfies TextProps,
  /** Inline link's `(url)` companion style — dimmer than the text. */
  linkUrl: {
    color: tokens.colors.muted,
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
  /** Strong / bold inline style. */
  strong: { bold: true } satisfies TextProps,
  /** Emphasised / italic inline style. */
  em: { italic: true } satisfies TextProps,
  /** Container around a horizontal rule. */
  horizontalRule: { flexDirection: "row" } satisfies BoxProps,
  /** Style of the horizontal rule glyph. */
  horizontalRuleText: {
    dimColor: tokens.typography.secondaryDim,
    color: tokens.colors.muted,
  } satisfies TextProps,
  /** Container around a rendered cli-table block. */
  table: { flexDirection: "column" } satisfies BoxProps,
  /** Style of the cli-table text payload. */
  tableText: { color: tokens.colors.muted } satisfies TextProps,
  /** Wrapper for plain paragraph text. */
  paragraphText: { wrap: "wrap" } satisfies TextProps,
}));

/** Resolved style object shape returned by {@link useMarkdownViewTheme}. */
export type MarkdownViewTheme = ThemeOf<typeof useMarkdownViewTheme>;
