import { lazy, Suspense } from "react";
import styles from "./MarkdownBlock.module.scss";

// The markdown, math, and highlighting libraries are large, so they load when a run is first opened.
const MarkdownBlockRender = lazy(() =>
  import("./MarkdownBlock.render").then((module) => ({
    default: module.MarkdownBlockRender,
  })),
);

/** The text to show. */
export interface MarkdownBlockProps {
  /** Markdown source, possibly still streaming. */
  readonly text: string;
}

/**
 * Show markdown text, readable as plain text until the formatter has loaded.
 * @param {MarkdownBlockProps} props - Component properties.
 * @returns {React.ReactElement} The formatted text.
 */
export function MarkdownBlock({ text }: MarkdownBlockProps) {
  return (
    <Suspense fallback={<div className={styles.plain}>{text}</div>}>
      <MarkdownBlockRender text={text} />
    </Suspense>
  );
}
