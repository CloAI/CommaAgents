/** Props for the `Scrollbar` presentational component. */
export interface ScrollbarProps {
  /** Total number of scrollable units (e.g. lines or list items). */
  readonly total: number;
  /** Number of units currently visible. */
  readonly windowSize: number;
  /** Zero-based offset of the first visible unit into `total`. */
  readonly offset: number;
  /**
   * Height of the rendered scrollbar, in terminal rows. Defaults to
   * `windowSize` (one scrollbar row per visible unit).
   */
  readonly height?: number;
}

/** Props for the `ScrollbarRender` render-only form. */
export interface ScrollbarRenderProps {
  /** Scrollbar column height, in rows. */
  readonly height: number;
  /**
   * Inclusive top index of the thumb within `[0, height)`. When the
   * scrollbar is inactive (content fits), this is `0` and
   * `thumbHeight === height` (i.e. the thumb fills the whole track).
   */
  readonly thumbTop: number;
  /** Thumb height in rows. Always `>= 1` when `height >= 1`. */
  readonly thumbHeight: number;
}
