/**
 * Single shared modal id for the OutputModal. The modal is a singleton —
 * only one expanded tool-result / thinking body is shown at a time —
 * so a stable id is enough.
 */
export const OUTPUT_MODAL_ID = "output-modal";

/**
 * Maximum number of lines retained in memory for grep+highlight. Beyond
 * this, the modal still shows scrollable content but search compiles
 * are skipped to keep frame time bounded. Picked empirically to handle
 * a multi-MB tool dump on a slow terminal without locking the UI.
 */
export const OUTPUT_MODAL_GREP_LINE_CAP = 5000;

/**
 * Glyph repeated for the modal's "no matches" empty-state row. Single
 * em-dash so it visually distinguishes from a literal grep hit.
 */
export const OUTPUT_MODAL_EMPTY_LINE = "\u2014";

/**
 * Placeholder shown inside the search input before the user types.
 */
export const OUTPUT_MODAL_SEARCH_PLACEHOLDER = "regex…";
