/** Calculated scrollbar geometry. */
export interface ScrollbarGeometry {
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
