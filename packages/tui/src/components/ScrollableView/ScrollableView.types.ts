import type React from "react";

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

/**
 * Props for {@link ScrollableView}.
 *
 * `ScrollableView` is the lower-level scrolling primitive: it lays out a
 * variable-height list of items inside a measured viewport and clips with
 * `overflow: hidden`. It has no concept of a selected row — only a scroll
 * offset and a mouse-wheel handler. Use {@link ScrollableList} when you
 * need keyboard-driven selection.
 */
export interface ScrollableViewProps<ItemType> {
  /** The items to render. */
  readonly items: readonly ItemType[];
  /** Stable key for each item. */
  readonly getKey: (item: ItemType, index: number) => string;
  /** Renders a single row. */
  readonly renderItem: (item: ItemType, index: number) => React.ReactNode;
  /**
   * Returns the height of a row in terminal rows. Defaults to `1` per
   * item — fine for single-line lists. Multi-line content (e.g. wrapped
   * messages) must supply this so the scrollbar geometry, `scrollToRow`,
   * and `stickToBottom` all behave correctly.
   *
   * The third argument `viewportWidth` is the measured viewport width in
   * columns at the time of the call. Use it to account for soft-wrap when
   * estimating multi-line content.
   *
   * MUST return the same value for the same `(item, index, viewportWidth)`
   * between renders unless the row's actual height changed — `ScrollableView`
   * does not memoize this.
   */
  readonly getRowHeight?: (item: ItemType, index: number, viewportWidth: number) => number;
  /**
   * When set, the view auto-scrolls so the row at this index is visible
   * after every layout commit. Use this to implement "follow the selected
   * row" behavior from a parent component.
   */
  readonly scrollToRow?: number;
  /**
   * When `true`, the view pins itself to the bottom on every layout
   * commit — new items push the visible window forward. Disengages
   * automatically the moment the user scrolls up with the wheel; re-
   * engages once they scroll back to the bottom edge.
   */
  readonly stickToBottom?: boolean;
  /** Notified whenever scroll state changes. */
  readonly onScrollChange?: (state: ScrollableViewState) => void;
  /** Text shown when `items` is empty. Defaults to "No items." */
  readonly emptyText?: string;
}
