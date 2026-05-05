import type { BundledLanguage } from "shiki/langs";

/** Props for the CodeView container component. */
export interface CodeViewProps {
  /** The source code string to syntax-highlight. */
  readonly code: string;
  /** Language identifier for highlighting (e.g. "typescript", "python"). */
  readonly language: BundledLanguage;
  /** Whether to display line numbers in the gutter. Defaults to `false`. */
  readonly showLineNumbers?: boolean;
}

/** Props for the pure render function. */
export interface CodeViewRenderProps {
  /** ANSI-highlighted code string, or `null` while the highlighter is loading. */
  readonly highlightedCode: string | null;
  /** Whether to display line numbers in the gutter. */
  readonly showLineNumbers: boolean;
  /** Original code string, used to derive line numbers and as fallback before highlighting loads. */
  readonly code: string;
  /** Resolved theme style objects for the component. */
  readonly theme: import("./CodeView.theme").CodeViewTheme;
}
