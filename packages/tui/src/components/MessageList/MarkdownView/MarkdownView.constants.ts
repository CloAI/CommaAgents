/**
 * Heading prefix glyph rendered before the heading text. Mirrors how
 * shells display headings (e.g. `# h1`) so users recognise the level
 * without relying on font weight alone.
 *
 * The `#` count matches the heading depth (1..6).
 */
export const HEADING_PREFIX_CHAR = "#";

/**
 * Bullet glyph for unordered lists. Single cell wide for predictable
 * column alignment when the row estimator counts wrapped widths.
 */
export const UNORDERED_LIST_BULLET = "\u2022";

/**
 * Indent applied per nesting level for nested lists. Two spaces matches
 * the source-text indent used by `marked`'s loose tokenizer and keeps
 * arithmetic with the row estimator simple.
 */
export const LIST_INDENT_PER_LEVEL = 2;

/**
 * Glyph drawn at the head of every blockquote line. Vertical bar is
 * the most readable terminal-safe blockquote marker.
 */
export const BLOCKQUOTE_PREFIX = "\u2502 ";

/**
 * Glyph used to render `<hr>` markdown. Repeated to a sensible width;
 * the renderer picks the actual repetition count based on the viewport.
 */
export const HORIZONTAL_RULE_CHAR = "\u2500";

/**
 * Default character width for the horizontal rule when the renderer is
 * not provided a viewport width. Matches the global
 * {@link Theme.separator.width} fallback in `theme.ts`.
 */
export const HORIZONTAL_RULE_DEFAULT_WIDTH = 60;

/**
 * Number of trailing rendered lines to keep when summarising a
 * `thinking` segment in the agent message. Anything earlier is
 * truncated and replaced with a `\u2026` ellipsis line.
 *
 * Five lines is a compromise between giving the user a sense of the
 * agent's reasoning shape and keeping long deliberations from
 * dominating the viewport.
 */
export const THINKING_TRUNCATION_LINE_COUNT = 5;

/**
 * Single-character ellipsis appended to truncated thinking output.
 * Matches the rest of the codebase (`AgentMessage.tsx`,
 * `ToolCallView.constants.ts`).
 */
export const THINKING_ELLIPSIS_LINE = "\u2026";
