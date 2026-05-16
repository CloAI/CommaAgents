import type { BundledLanguage } from "shiki/langs";

import type { MarkdownViewTheme } from "./MarkdownView.theme";

/**
 * Inline span — a leaf or one level of nested formatting that lives
 * inside a single line of flowing text (paragraph, heading, list item,
 * blockquote, table cell).
 *
 * The renderer flattens these into a single Ink `<Text>` element with
 * nested `<Text>` style fragments, which is the only nesting Ink
 * supports for inline styling.
 */
export type MdInline =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "strong"; readonly children: readonly MdInline[] }
  | { readonly kind: "em"; readonly children: readonly MdInline[] }
  | { readonly kind: "code"; readonly value: string }
  | {
      readonly kind: "link";
      readonly text: string;
      readonly href: string;
    };

/**
 * Block-level node — top-level entity in the rendered Markdown
 * document. Each block becomes one or more Ink `<Box>`/`<Text>`
 * elements, separated by a single blank row from its neighbour.
 */
export type MdBlock =
  | { readonly kind: "paragraph"; readonly children: readonly MdInline[] }
  | {
      readonly kind: "heading";
      /** Heading depth, clamped to `1..6` to match Markdown spec. */
      readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
      readonly children: readonly MdInline[];
    }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      /** 1-based starting index for ordered lists; ignored when `!ordered`. */
      readonly start: number;
      readonly items: readonly MdListItem[];
    }
  | { readonly kind: "blockquote"; readonly children: readonly MdBlock[] }
  | {
      readonly kind: "code";
      /** Raw source text of the fenced block (no surrounding fences). */
      readonly value: string;
      /** Language identifier as written after the opening fence; may be empty. */
      readonly language: string;
    }
  | {
      readonly kind: "table";
      readonly header: readonly (readonly MdInline[])[];
      readonly rows: readonly (readonly (readonly MdInline[])[])[];
    }
  | { readonly kind: "hr" };

/** A single list item (may itself contain nested blocks). */
export interface MdListItem {
  /** Inline content of the item's first line. */
  readonly children: readonly MdInline[];
  /** Nested blocks (e.g. a sub-list) rendered indented under the item. */
  readonly nested: readonly MdBlock[];
}

/** Props for the {@link MarkdownView} container. */
export interface MarkdownViewProps {
  /** Raw Markdown source. */
  readonly markdown: string;
  /**
   * Optional override for the column width used to size the horizontal
   * rule and the table layout. Defaults to
   * {@link HORIZONTAL_RULE_DEFAULT_WIDTH}.
   */
  readonly width?: number;
}

/** Props for the pure {@link MarkdownViewRender} function. */
export interface MarkdownViewRenderProps {
  /** Block tree to render. */
  readonly blocks: readonly MdBlock[];
  /** Resolved theme styles. */
  readonly theme: MarkdownViewTheme;
  /** Effective column width for layout-sensitive blocks (hr, table). */
  readonly width: number;
}

/**
 * Re-export of shiki's bundled language union so the table-renderer's
 * fenced-code dispatch can advertise its accepted set without each
 * call site importing shiki directly.
 */
export type FencedLanguage = BundledLanguage;
