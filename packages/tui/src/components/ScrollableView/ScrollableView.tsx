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

import { useScrollableViewTheme } from "./ScrollableView.theme";
import type {
  ScrollableViewProps,
  ScrollableViewRenderProps,
} from "./ScrollableView.types";

/** Placeholder height used before an item has been measured. */
const DEFAULT_ROW_HEIGHT = 1;
/** Rows of items kept mounted above and below the visible window. */
const OVERSCAN_ROWS = 3;

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
 * geometry. The cache survives across renders via `useRef`, and entries
 * invalidate when an item's reference identity changes (so streaming
 * chat messages that produce a new object on every chunk are re-measured
 * with their new content).
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
export function ScrollableView<ItemType>(
  props: ScrollableViewProps<ItemType>,
): React.ReactElement {
  const {
    items,
    getKey,
    renderItem,
    scrollToRow,
    stickToBottom = false,
    onScrollChange,
    emptyText = "No items.",
  } = props;

  const theme = useScrollableViewTheme();

  const viewportRef = useRef<DOMElement | null>(null);
  const { height: viewportHeight, width: viewportWidth } = useBoxMetrics(
    viewportRef as RefObject<DOMElement>,
  );

  const totalCount = items.length;

  // Per-(item identity, viewport width) measurement cache. Outer map keys
  // by `getKey(item)`; the entry holds the original item reference so we
  // can detect content changes and invalidate. Inner map keys by width so
  // resizing the terminal keeps measurements for other widths intact.
  // The cache lives across renders via useRef and is populated in
  // useLayoutEffect (synchronously after commit, before paint).
  const cacheRef = useRef<
    Map<string, { item: ItemType; widths: Map<number, number> }>
  >(new Map());

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
      if (entry !== undefined && entry.item !== item) {
        // Item reference changed — invalidate every cached width for this key.
        cacheRef.current.delete(key);
        entry = undefined;
      }
      if (entry === undefined) {
        entry = { item, widths: new Map() };
        cacheRef.current.set(key, entry);
      }
      if (entry.widths.has(viewportWidth)) continue;
      const measured = measureLayout(renderItem(item, index), {
        width: viewportWidth,
      });
      entry.widths.set(viewportWidth, Math.max(0, measured.height));
      mutated = true;
    }
    if (mutated) bumpMeasureRevision();
  }, [items, getKey, renderItem, viewportWidth]);

  // Synchronous read from the cache. Returns `DEFAULT_ROW_HEIGHT` when an
  // item has not yet been measured (first commit, or freshly invalidated).
  // The follow-up useLayoutEffect measures the missing items and triggers
  // a re-render with the real heights, all before the user sees a frame.
  const rowHeight = useCallback(
    (index: number): number => {
      const item = items[index];
      if (item === undefined) return 0;
      if (viewportWidth <= 0) return DEFAULT_ROW_HEIGHT;
      const entry = cacheRef.current.get(getKey(item, index));
      if (entry === undefined || entry.item !== item) {
        return DEFAULT_ROW_HEIGHT;
      }
      return entry.widths.get(viewportWidth) ?? DEFAULT_ROW_HEIGHT;
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
  // We **only** render items whose top edge lands at or below `rowOffset`,
  // so the inner box stack uses non-negative spacers and the visible
  // window relies on Ink's `overflow: hidden` only for clipping content
  // that runs *past* the bottom edge. Negative margins / negative
  // positions don't clip reliably in Ink today, so we avoid them
  // entirely. The trade-off: items that are scrolled half-off the top
  // disappear when their top crosses the scroll line rather than
  // gracefully clipping at the boundary. Snap-by-item scroll behavior
  // (via `useMouseWheelScroll` below) hides this seam in practice.
  //
  // When `viewportHeight` is still zero — most commonly on the synchronous
  // first commit before `useBoxMetrics` has reported real dimensions, or
  // when callers (tests, `renderToString`) read `lastFrame()` without
  // awaiting a microtask — we fall back to rendering every item. The
  // fallback keeps initial frames non-empty; the next commit, with real
  // viewport metrics, switches to the virtualized window.
  const { renderStart, renderEnd, topSpacerHeight } = useMemo(() => {
    if (totalCount === 0) {
      return { renderStart: 0, renderEnd: 0, topSpacerHeight: 0 };
    }
    if (viewportHeight <= 0) {
      return { renderStart: 0, renderEnd: totalCount, topSpacerHeight: 0 };
    }
    // First item whose top edge is at or below the scroll line. Items
    // strictly above this index are either fully above the viewport
    // (skip cleanly) or partially scrolled — which we also skip rather
    // than render at a negative position.
    let start = 0;
    while (start < totalCount && (rowOffsets[start] ?? 0) < rowOffset) {
      start += 1;
    }
    // Tall last item: if the bottom item is taller than the viewport,
    // every item's top can end up *above* `rowOffset` while its body still
    // intersects the viewport. Fall back to rendering that last item from
    // its own top so the viewport doesn't go blank. The user sees the
    // beginning of the item; scrolling can reveal the rest.
    if (start === totalCount) {
      start = totalCount - 1;
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
    const spacer = Math.max(0, (rowOffsets[start] ?? 0) - rowOffset);
    return { renderStart: start, renderEnd: end, topSpacerHeight: spacer };
  }, [totalCount, viewportHeight, rowOffsets, rowOffset]);

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
        // Snap by item, not by raw rows. Since the renderer only mounts
        // items whose top is at or below the scroll line (negative offsets
        // don't clip reliably in Ink), advancing rowOffset to the next
        // item's `rowOffsets[]` value guarantees that each wheel tick
        // produces a visible change rather than landing the scroll inside
        // a tall item where nothing repaints.
        const currentIndex = (() => {
          // Largest i where rowOffsets[i] <= current.
          let i = 0;
          while (
            i < totalCount &&
            (rowOffsets[i + 1] ?? totalRows) <= current
          ) {
            i += 1;
          }
          return Math.min(i, totalCount - 1);
        })();
        const targetIndex =
          event.direction === "up"
            ? Math.max(0, currentIndex - 1)
            : Math.min(totalCount - 1, currentIndex + 1);
        const targetOffset = rowOffsets[targetIndex] ?? 0;
        const next = Math.max(0, Math.min(targetOffset, maxOffset));
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
      topSpacerHeight={topSpacerHeight}
      renderStart={renderStart}
      renderEnd={renderEnd}
      showScrollbar={showScrollbar}
      emptyText={emptyText}
      theme={theme}
      viewportRef={viewportRef}
    />
  );
}

export function ScrollableViewRender<ItemType>({
  items,
  getKey,
  renderItem,
  totalCount,
  viewportHeight,
  totalRows,
  rowOffset,
  topSpacerHeight,
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

  // Visible items render in plain column flow underneath a non-negative
  // spacer Box. Anything below the viewport bottom is clipped by Ink's
  // `overflow: hidden`, which works reliably for *positive* overflow.
  // We deliberately do **not** use `marginTop={-rowOffset}` here —
  // negative margins leak past `overflow: hidden` in Ink today, so the
  // overscan below `renderStart` gets painted outside the viewport.
  // Snapping `renderStart` to the first item whose top is at or below
  // `rowOffset` keeps the spacer non-negative and matches the wheel-scroll
  // snap semantics in the container above.
  const visibleItems = items.slice(renderStart, renderEnd);

  return (
    <Box {...theme.outer}>
      <Box ref={viewportRef} {...theme.viewport}>
        <Box flexDirection="column" width="100%" flexShrink={0}>
          {topSpacerHeight > 0 ? (
            <Box flexShrink={0} width="100%" height={topSpacerHeight} />
          ) : null}
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
