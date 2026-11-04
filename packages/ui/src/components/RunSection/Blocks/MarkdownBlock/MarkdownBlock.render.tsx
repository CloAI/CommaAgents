import { memo } from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import "katex/dist/katex.min.css";
import { CodeBlock } from "../CodeBlock";
import { REHYPE_PLUGINS, REMARK_PLUGINS } from "./MarkdownBlock.constants";
import styles from "./MarkdownBlock.module.scss";
import { allowUrl, normalizeMathDelimiters } from "./MarkdownBlock.utils";

const COMPONENTS: Components = {
  pre: ({ node, children }) => {
    const code = node?.children[0];
    const className =
      code?.type === "element" ? code.properties.className : undefined;
    const language = Array.isArray(className)
      ? className
          .map(String)
          .find((name) => name.startsWith("language-"))
          ?.slice("language-".length)
      : undefined;
    return <CodeBlock language={language}>{children}</CodeBlock>;
  },
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // Images would load from third parties, so they show as links instead.
  img: ({ src, alt }) =>
    typeof src === "string" ? (
      <a href={src} target="_blank" rel="noopener noreferrer">
        {alt || src}
      </a>
    ) : (
      <span>{alt}</span>
    ),
};

/** The text to format. */
export interface MarkdownBlockRenderProps {
  /** Markdown source, possibly still streaming. */
  readonly text: string;
}

/**
 * Format markdown with code blocks, tables, and math.
 * @param {MarkdownBlockRenderProps} props - Component properties.
 * @returns {React.ReactElement} The formatted text.
 */
export const MarkdownBlockRender = memo(function MarkdownBlockRender({
  text,
}: MarkdownBlockRenderProps) {
  return (
    <div className={styles.markdownBlock}>
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
        urlTransform={allowUrl}
      >
        {normalizeMathDelimiters(text)}
      </Markdown>
    </div>
  );
});
