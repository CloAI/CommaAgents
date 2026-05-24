import type { DOMElement } from "ink";
import type React from "react";

import type { ScrollableViewTheme } from "./ScrollableView.theme";

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
 *
 * Row heights are measured automatically via Ink's headless layout
 * (`measureLayout`) keyed by `(getKey(item, index), viewportWidth)`. Cache
 * entries invalidate when an item's identity changes (so streaming
 * messages that produce a new object per chunk are re-measured). Only
 * items inside the visible window plus a small overscan are mounted in
 * the rendered tree.
 */
export interface ScrollableViewProps<ItemType> {
  /** The items to render. */
  readonly items: readonly ItemType[];
  /**
   * Stable key for each item. Used as the React key for the row and as
   * the primary cache key for measured heights — keep it stable when the
   * item's logical identity stays the same and let it change when content
   * fundamentally changes.
   */
  readonly getKey: (item: ItemType, index: number) => string;
  /**
   * Renders a single row. The same JSX is invoked twice per
   * `(item, viewportWidth)` combination: once inside a detached yoga
   * tree to measure the row's natural height, then once in the live
   * tree for the visible window. Both invocations happen synchronously
   * with the same input, so the result must be a pure function of the
   * arguments. Avoid spawning side effects from `renderItem` itself.
   */
  readonly renderItem: (item: ItemType, index: number) => React.ReactNode;
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

/**
 * Props for {@link ScrollableViewRender}.
 *
 * Pure render props — all hook-derived values are computed by the
 * container and passed down.
 */
export interface ScrollableViewRenderProps<ItemType> {
  /** The items to render. */
  readonly items: readonly ItemType[];
  /** Stable key for each item. */
  readonly getKey: (item: ItemType, index: number) => string;
  /** Renders a single row. */
  readonly renderItem: (item: ItemType, index: number) => React.ReactNode;
  /** Total number of items. */
  readonly totalCount: number;
  /** Measured viewport height in rows. */
  readonly viewportHeight: number;
  /** Total content height in rows. */
  readonly totalRows: number;
  /** Current scroll offset in rows. */
  readonly rowOffset: number;
  /**
   * Height of the leading spacer Box rendered above the first visible
   * item. Equals `max(0, rowOffsets[renderStart] - rowOffset)` — i.e. the
   * gap between the scroll line and the first item that is fully at or
   * below it. Always non-negative because the renderer does not use
   * negative margins (they leak past `overflow: hidden` in Ink today).
   */
  readonly topSpacerHeight: number;
  /** First item index to mount (inclusive). */
  readonly renderStart: number;
  /** One past the last item index to mount. */
  readonly renderEnd: number;
  /** Whether the scrollbar should be visible. */
  readonly showScrollbar: boolean;
  /** Text shown when items is empty. */
  readonly emptyText: string;
  /** Spread-ready theme style objects. */
  readonly theme: ScrollableViewTheme;
  /** Ref for the viewport box, attached by this render. */
  readonly viewportRef: React.RefObject<DOMElement>;
}
