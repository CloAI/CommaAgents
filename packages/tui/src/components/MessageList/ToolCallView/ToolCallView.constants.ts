/**
 * Glyph drawn at the head of a completed tool-call row.
 *
 * Heavy check mark — distinct from a regular ASCII tick to read as a
 * status badge rather than punctuation. Single cell wide.
 */
export const TOOL_CALL_GLYPH_COMPLETED = "\u2713";

/**
 * Glyph drawn at the head of an errored tool-call row.
 *
 * Heavy ballot X — pairs visually with the completed check mark and
 * stays single-cell wide for column alignment.
 */
export const TOOL_CALL_GLYPH_ERROR = "\u2717";

/**
 * Maximum number of characters of args preview rendered inline before
 * truncation with an ellipsis. Newlines are collapsed to spaces *before*
 * truncation so multi-line JSON blobs still render as a single visual
 * row.
 *
 * NOTE: A future iteration will replace this with viewport-width-fitting
 * once `viewportWidth` is plumbed into the segment render path. Until
 * then, this cap matches the renderer's actual single-line capacity on
 * an 80-column panel and keeps the row estimator's text-only count in
 * sync with the rendered output.
 */
export const TOOL_CALL_ARGS_PREVIEW_LENGTH = 160;

/**
 * Maximum length of an inline error message in the result summary
 * before truncation. Errors are usually short (`ENOENT…`,
 * `TypeError: …`) but we cap defensively so a stack-trace-shaped error
 * can't blow up a row.
 */
export const TOOL_CALL_ERROR_PREVIEW_LENGTH = 120;

/**
 * Single-character ellipsis appended to clipped previews.
 *
 * Using the typographic `\u2026` rather than three dots keeps the
 * preview a single visual cell shorter than `...` would, and matches
 * the existing `truncatePreview` helper in `AgentMessage.tsx`.
 */
export const TOOL_CALL_ELLIPSIS = "\u2026";
