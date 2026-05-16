/**
 * Discriminator for what kind of agent segment is being expanded.
 * Used purely for the modal title prefix and for analytics-friendly
 * snapshots; the body itself is always plain text.
 */
export type OutputModalKind = "tool-result" | "thinking";

/**
 * Payload carried via {@link useModal} when opening the OutputModal.
 *
 * `body` is taken verbatim from the source segment (no markdown
 * pre-processing) so grep semantics line up with what the user sees.
 */
export interface OutputModalPayload {
  /** Origin segment kind — drives the title prefix only. */
  readonly kind: OutputModalKind;
  /** Human-readable header text (e.g. tool name or "thinking"). */
  readonly title: string;
  /** Raw multi-line body to display. */
  readonly body: string;
}

/**
 * A single rendered line inside the modal body, after filtering by
 * the current search query.
 *
 * `segments` is a sequence of `(text, isMatch)` runs that the renderer
 * walks to draw highlight inversions. When the query is empty, every
 * line collapses to a single `{ text, isMatch: false }` segment.
 */
export interface OutputModalLine {
  /** 1-based source line number, preserved from the original body. */
  readonly lineNumber: number;
  /** Run-length segmentation of the line for highlight rendering. */
  readonly segments: readonly OutputModalLineSegment[];
}

/** One run inside an `OutputModalLine`. */
export interface OutputModalLineSegment {
  /** Slice of the source line. */
  readonly text: string;
  /** Whether this slice matched the active grep regex. */
  readonly isMatch: boolean;
}

/**
 * Result of compiling a user-supplied search query.
 *
 * `regex === null` means "no active filter" — the renderer should show
 * every line and skip highlighting. We surface the original query so
 * the search bar can echo it back unmodified.
 */
export interface OutputModalQuery {
  /** Original query string as typed by the user. */
  readonly raw: string;
  /** Compiled regex, or `null` when the query is empty / invalid. */
  readonly regex: RegExp | null;
  /** True when the user typed a non-empty query that failed to compile. */
  readonly invalid: boolean;
}
