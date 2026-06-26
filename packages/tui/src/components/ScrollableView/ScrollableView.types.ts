/**
 * Snapshot of {@link ScrollableView}'s scroll state, delivered to
 * `onScrollChange` whenever the offset, viewport, or content size
 * changes.
 */
export interface ScrollableViewState {
  /** Current top offset in terminal rows. */
  readonly rowOffset: number;
  /** Total content height in rows (sum of all measured row heights). */
  readonly totalRows: number;
  /** Measured viewport height in rows. */
  readonly viewportRows: number;
  /** True when `rowOffset` is at the largest valid value. */
  readonly atBottom: boolean;
}

export interface MeasurementCacheEntry<ItemType> {
  readonly widths: Map<
    number,
    {
      readonly item: ItemType;
      readonly height: number;
    }
  >;
}
