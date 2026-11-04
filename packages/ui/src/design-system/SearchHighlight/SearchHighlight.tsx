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
 * //AI: Rename, HighlightText
 * Highlight matching text without interpreting search input as markup or a pattern.
 * @param {SearchHighlightProps} props - Display text and current search.
 * @returns {React.ReactElement} Text with matching substrings marked.
 */
export function SearchHighlight({ text, query }: SearchHighlightProps) {
  const searchTerm = query.trim().toLowerCase();
  if (!searchTerm) {
    return <>{text}</>;
  }
  const lowerText = text.toLowerCase();
  const highlightedParts: ReactNode[] = [];
  let textCursor = 0;
  let matchIndex = lowerText.indexOf(searchTerm);
  while (matchIndex !== -1) {
    highlightedParts.push(text.slice(textCursor, matchIndex));
    highlightedParts.push(
      <mark key={matchIndex} className={styles.match}>
        {text.slice(matchIndex, matchIndex + searchTerm.length)}
      </mark>,
    );
    textCursor = matchIndex + searchTerm.length;
    matchIndex = lowerText.indexOf(searchTerm, textCursor);
  }
  highlightedParts.push(text.slice(textCursor));
  return <>{highlightedParts}</>;
}
