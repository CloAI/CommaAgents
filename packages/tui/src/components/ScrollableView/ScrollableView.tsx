import { Box, type DOMElement, measureLayout, Text, useBoxMetrics } from "ink";
import type React from "react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import { useMouseWheelScroll } from "../../hooks/useMouseWheelScroll";
import { Scrollbar } from "../Scrollbar";

import {
  DEFAULT_ROW_HEIGHT,
  OVERSCAN_ROWS,
  WHEEL_SCROLL_ROWS,
} from "./ScrollableView.constants";
import { useScrollableViewTheme } from "./ScrollableView.theme";
import type {
  MeasurementCacheEntry,
  ScrollableViewState,
} from "./ScrollableView.types";

export interface ScrollableViewProps<ItemType> {
  /** Items rendered by the virtualized view. */
  readonly items: readonly ItemType[];
  /** Stable identity used for React keys and measurement caching. */
  readonly getKey: (item: ItemType, index: number) => string;
  /** Pure row renderer used for both measurement and visible output. */
  readonly renderItem: (item: ItemType, index: number) => React.ReactNode;
  /** Row index that should be scrolled into view. */
  readonly scrollToRow?: number;
  /** Whether new content should keep the view pinned to the bottom. */
  readonly stickToBottom?: boolean;
  /** Callback invoked when measured scroll state changes. */
  readonly onScrollChange?: (state: ScrollableViewState) => void;
  /** Empty-state text. @default "No items." */
  readonly emptyText?: string;
}

/**
 * Variable-height, virtualized scrollable container.
 *
 * Lays out a list of items inside a measured viewport and clips with
 * `overflow: hidden`. Row heights are measured automatically via Ink's
 * headless `measureLayout` — no callback required from the caller — and
 * cached by `(getKey(item), viewportWidth)`. Only items inside the
 * visible window plus a small overscan are mounted in the live render
 * tree, so a list of thousands of rows still renders cheap.
 *
 * Measurement runs in a `useLayoutEffect` immediately after commit, so
 * the rendered frame the user sees always reflects the post-measurement
 * geometry. The cache survives across renders via `useRef`; when an item
 * reference changes, the previous height is reused until the replacement
 * object is re-measured, keeping streaming chat updates from briefly
 * collapsing the scroll geometry.
 *
 * The view does **not** handle keyboard input. Use {@link ScrollableList}
 * for keyboard-driven single-selection lists.
 *
 * @example
 * ```tsx
 * <ScrollableView
 *   items={messages}
 *   getKey={(message) => message.id}
 *   renderItem={(message) => <MessageRow message={message} />}
 *   stickToBottom
 * />
 * ```
 */
export function ScrollableView<ItemType>({
  items,
  getKey,
  renderItem,
  scrollToRow,
  stickToBottom = false,
  onScrollChange,
  emptyText = "No items.",
}: ScrollableViewProps<ItemType>): React.ReactElement {
  const theme = useScrollableViewTheme();

  const viewportRef = useRef<DOMElement | null>(null);
  const { height: viewportHeight, width: viewportWidth } = useBoxMetrics(
    viewportRef as RefObject<DOMElement>,
  );

  const totalCount = items.length;

  // Per-(item identity, viewport width) measurement cache. Outer map keys
  // by `getKey(item)`. Inner entries remember both the measured height and
  // the item reference that produced it, so streaming updates can reuse the
  // last known height for one render while the new object is remeasured.
  // The cache lives across renders via useRef and is populated in
  // useLayoutEffect (synchronously after commit, before paint).
  const cacheRef = useRef<Map<string, MeasurementCacheEntry<ItemType>>>(
    new Map(),
  );

  // Bumped after a measurement pass adds new cache entries; used as the
  // dependency that wakes up `rowOffsets` / visible-window math.
  // `useReducer` gives us a stable dispatch without recreating closures
  // every render.
  const [measureRevision, bumpMeasureRevision] = useReducer(
    (count: number) => count + 1,
    0,
  );

  // Synchronous measurement pass. Runs after every commit that changes
  // `items`, `viewportWidth`, or `renderItem`. Measures any item whose
  // (identity, width) pair is not yet cached. We schedule this in a
  // `useLayoutEffect` rather than during render because `measureLayout`
  // calls `react-reconciler`'s `updateContainerSync` internally — calling
  // it from render would re-enter the same reconciler module and trigger
  // React's "nested updates" diagnostic.
  useLayoutEffect(() => {
    if (viewportWidth <= 0) return;
    let mutated = false;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item === undefined) continue;
      const key = getKey(item, index);
      let entry = cacheRef.current.get(key);
      if (entry === undefined) {
        entry = { widths: new Map() };
        cacheRef.current.set(key, entry);
      }
      const cached = entry.widths.get(viewportWidth);
      if (cached?.item === item) continue;
      const measured = measureLayout(renderItem(item, index), {
        width: viewportWidth,
      });
      entry.widths.set(viewportWidth, {
        item,
        height: Math.max(0, measured.height),
      });
      mutated = true;
    }
    if (mutated) bumpMeasureRevision();
  }, [items, getKey, renderItem, viewportWidth]);

  // Synchronous read from the cache. Returns `DEFAULT_ROW_HEIGHT` only when
  // the row has never been measured at this width. If a streaming update
  // swaps in a new item object with the same key, the previous height is
  // reused until the follow-up useLayoutEffect records the fresh height.
  const rowHeight = useCallback(
    (index: number): number => {
      const item = items[index];
      if (item === undefined) return 0;
      if (viewportWidth <= 0) return DEFAULT_ROW_HEIGHT;
      const entry = cacheRef.current.get(getKey(item, index));
      return entry?.widths.get(viewportWidth)?.height ?? DEFAULT_ROW_HEIGHT;
    },
    [items, getKey, viewportWidth],
  );

  // Prefix-sum table of row positions. `rowOffsets[i]` is the cumulative
  // y-coordinate of item `i` in the content's own coordinate system, and
  // `rowOffsets[totalCount]` equals `totalRows`. Built once per render so
  // the visible-window scan and absolute positioning of rendered rows are
  // O(1) lookups.
  //
  // `measureRevision` is in the deps on purpose. The cache is mutated in
  // place by the measurement effect; the revision counter is the only
  // reactive signal that lets this memo recompute when new heights land.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above.
  const rowOffsets = useMemo(() => {
    const offsets: number[] = [0];
    for (let i = 0; i < totalCount; i += 1) {
      offsets.push((offsets[i] ?? 0) + rowHeight(i));
    }
    return offsets;
  }, [totalCount, rowHeight, measureRevision]);

  const totalRows = rowOffsets[totalCount] ?? 0;
  const maxOffset = Math.max(0, totalRows - viewportHeight);

  const [rowOffset, setRowOffset] = useState(0);
  const isPinnedRef = useRef(true);

  // Linear scan to find the visible index range. `totalCount` is bounded
  // by the source list size; for the lists we virtualize this stays cheap.
  // Switch to a binary search over `rowOffsets` if profiling shows this
  // dominates.
  //
  // `renderStart` is the item whose body contains the scroll line —
  // i.e. the largest `i` such that `rowOffsets[i] <= rowOffset`. That
  // item may have its top above the viewport, and we render it with a
  // negative `marginTop` so the visible portion lines up with the
  // viewport top. Ink's `overflow: hidden` (set on the outer viewport
  // box) clips the part that runs off the top via `output.clip`, which
  // correctly handles negative y positions.
  //
  // When `viewportHeight` is still zero — most commonly on the synchronous
  // first commit before `useBoxMetrics` has reported real dimensions, or
  // when callers (tests, `renderToString`) read `lastFrame()` without
  // awaiting a microtask — we fall back to rendering every item. The
  // fallback keeps initial frames non-empty; the next commit, with real
  // viewport metrics, switches to the virtualized window.
  const { renderStart, renderEnd, topClipRows } = useMemo(() => {
    if (totalCount === 0) {
      return { renderStart: 0, renderEnd: 0, topClipRows: 0 };
    }
    if (viewportHeight <= 0) {
      return { renderStart: 0, renderEnd: totalCount, topClipRows: 0 };
    }
    // Largest `i` where `rowOffsets[i] <= rowOffset`. That item's top is
    // at or above the scroll line; the rows between `rowOffsets[start]`
    // and `rowOffset` are clipped off the top by a negative margin in
    // the renderer.
    let start = 0;
    while (
      start + 1 < totalCount &&
      (rowOffsets[start + 1] ?? totalRows) <= rowOffset
    ) {
      start += 1;
    }
    // Last item whose top edge is above the bottom of the viewport.
    // Bottom partial items render normally and get clipped by
    // `overflow: hidden`, which works reliably for positive overflow.
    let end = start;
    while (
      end < totalCount &&
      (rowOffsets[end] ?? 0) < rowOffset + viewportHeight
    ) {
      end += 1;
    }
    end = Math.min(totalCount, end + OVERSCAN_ROWS);
    const clip = Math.max(0, rowOffset - (rowOffsets[start] ?? 0));
    return { renderStart: start, renderEnd: end, topClipRows: clip };
  }, [totalCount, viewportHeight, rowOffsets, rowOffset, totalRows]);

  useEffect(() => {
    if (!stickToBottom) return;
    if (totalCount === 0 || viewportHeight <= 0) return;
    if (!isPinnedRef.current) return;
    setRowOffset((current) => (current === maxOffset ? current : maxOffset));
  }, [stickToBottom, maxOffset, totalCount, viewportHeight]);

  useEffect(() => {
    if (scrollToRow === undefined) return;
    if (totalCount === 0 || viewportHeight <= 0) return;
    const index = Math.max(0, Math.min(scrollToRow, totalCount - 1));
    const top = rowOffsets[index] ?? 0;
    const height = rowHeight(index);
    setRowOffset((current) => {
      let next = Math.min(current, maxOffset);
      if (top < next) {
        next = top;
      } else if (top + height > next + viewportHeight) {
        next = top + height - viewportHeight;
      }
      return Math.max(0, Math.min(next, maxOffset));
    });
  }, [
    scrollToRow,
    totalCount,
    viewportHeight,
    maxOffset,
    rowOffsets,
    rowHeight,
  ]);

  useEffect(() => {
    setRowOffset((current) => Math.min(current, maxOffset));
  }, [maxOffset]);

  useEffect(() => {
    if (onScrollChange === undefined) return;
    onScrollChange({
      rowOffset,
      totalRows,
      viewportRows: viewportHeight,
      atBottom: rowOffset >= maxOffset,
    });
  }, [onScrollChange, rowOffset, totalRows, viewportHeight, maxOffset]);

  useMouseWheelScroll({
    ref: viewportRef,
    onScroll: (event) => {
      if (totalCount === 0) return;
      setRowOffset((current) => {
        // Advance by terminal rows, not by items. The renderer clips the
        // partially-scrolled top item via a negative margin (see the
        // `renderStart` memo above), so every wheel tick produces a
        // visible change even inside a tall message that spans many
        // rows. `MouseScrollEvent` has no delta field — every tick is
        // discrete — so we step by a fixed amount that roughly matches
        // the "three lines per notch" default of GUI scroll wheels.
        const delta =
          event.direction === "up" ? -WHEEL_SCROLL_ROWS : WHEEL_SCROLL_ROWS;
        const next = Math.max(0, Math.min(current + delta, maxOffset));
        isPinnedRef.current = next >= maxOffset;
        return next;
      });
    },
  });

  const showScrollbar = viewportHeight > 0 && totalRows > viewportHeight;

  return (
    <ScrollableViewRender<ItemType>
      items={items}
      getKey={getKey}
      renderItem={renderItem}
      totalCount={totalCount}
      viewportHeight={viewportHeight}
      totalRows={totalRows}
      rowOffset={rowOffset}
      topClipRows={topClipRows}
      renderStart={renderStart}
      renderEnd={renderEnd}
      showScrollbar={showScrollbar}
      emptyText={emptyText}
      theme={theme}
      viewportRef={viewportRef}
    />
  );
}

export interface ScrollableViewRenderProps<ItemType> {
  /** Items available to the render window. */
  readonly items: readonly ItemType[];
  /** Stable key for each item. */
  readonly getKey: (item: ItemType, index: number) => string;
  /** Pure renderer for one item. */
  readonly renderItem: (item: ItemType, index: number) => React.ReactNode;
  /** Total item count. */
  readonly totalCount: number;
  /** Measured viewport height in terminal rows. */
  readonly viewportHeight: number;
  /** Total measured content height in terminal rows. */
  readonly totalRows: number;
  /** Current scroll offset in terminal rows. */
  readonly rowOffset: number;
  /** Rows clipped from the first mounted item. */
  readonly topClipRows: number;
  /** First mounted item index, inclusive. */
  readonly renderStart: number;
  /** Final mounted item index, exclusive. */
  readonly renderEnd: number;
  /** Whether the scrollbar is visible. */
  readonly showScrollbar: boolean;
  /** Empty-state text. */
  readonly emptyText: string;
  /** Resolved component theme. */
  readonly theme: import("./ScrollableView.theme").ScrollableViewTheme;
  /** Ref attached to the measured viewport. */
  readonly viewportRef: React.RefObject<DOMElement | null>;
}

export function ScrollableViewRender<ItemType>({
  items,
  getKey,
  renderItem,
  totalCount,
  viewportHeight,
  totalRows,
  rowOffset,
  topClipRows,
  renderStart,
  renderEnd,
  showScrollbar,
  emptyText,
  theme,
  viewportRef,
}: ScrollableViewRenderProps<ItemType>): React.ReactElement {
  if (totalCount === 0) {
    return (
      <Box {...theme.empty}>
        <Text {...theme.emptyText}>{emptyText}</Text>
      </Box>
    );
  }

  // Visible items render in plain column flow. When the scroll line lands
  // inside the first rendered item, we shift the entire stack up with a
  // negative `marginTop` so the visible portion of that item lines up
  // with the viewport top. Ink's `overflow: hidden` on the viewport box
  // clips the rows that run above y=0 (see `output.clip` in Ink — it
  // handles negative y correctly). Anything that runs past the bottom
  // is clipped the same way.
  const visibleItems = items.slice(renderStart, renderEnd);

  return (
    <Box {...theme.outer}>
      <Box ref={viewportRef} {...theme.viewport}>
        <Box
          flexDirection="column"
          width="100%"
          flexShrink={0}
          marginTop={-topClipRows}
        >
          {visibleItems.map((item, offset) => {
            const index = renderStart + offset;
            return (
              <Box
                key={getKey(item, index)}
                flexShrink={0}
                width="100%"
                flexDirection="column"
              >
                {renderItem(item, index)}
              </Box>
            );
          })}
        </Box>
      </Box>
      {showScrollbar && (
        <Scrollbar
          total={totalRows}
          windowSize={viewportHeight}
          offset={rowOffset}
          height={viewportHeight}
        />
      )}
    </Box>
  );
}
