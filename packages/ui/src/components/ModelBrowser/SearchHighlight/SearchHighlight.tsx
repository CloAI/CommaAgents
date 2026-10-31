import type { ReactNode } from "react";
import styles from "./SearchHighlight.module.scss";

/** Literal text and the search term to emphasize. */
export interface SearchHighlightProps {
  /** Original text to display without changing its casing. */
  readonly text: string;
  /** Case-insensitive literal search; surrounding spaces are ignored. */
  readonly query: string;
}

/**
 * Highlight matching text without interpreting search input as markup or a pattern.
 * @param {SearchHighlightProps} props - Display text and current search.
 * @returns {React.ReactElement} Text with matching substrings marked.
 */
export function SearchHighlight({ text, query }: SearchHighlightProps) {
  const term = query.trim().toLowerCase();
  if (!term) return <>{text}</>;
  const normalized = text.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match = normalized.indexOf(term);
  while (match !== -1) {
    parts.push(text.slice(cursor, match));
    parts.push(
      <mark key={match} className={styles.match}>
        {text.slice(match, match + term.length)}
      </mark>,
    );
    cursor = match + term.length;
    match = normalized.indexOf(term, cursor);
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
