import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Box, type DOMElement, Text, useBoxMetrics } from "ink";
import type React from "react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useMouseWheelScroll } from "../../hooks/useMouseWheelScroll";
import { Scrollbar } from "../Scrollbar";

import { useScrollableViewTheme } from "./ScrollableView.theme";
import type { ScrollableViewProps } from "./ScrollableView.types";

const _DEBUG_FILE = join(tmpdir(), "comma-agents-chat-debug.log");
function _debugLog(tag: string, payload: unknown): void {
  try {
    appendFileSync(_DEBUG_FILE, `[${new Date().toISOString()}] ${tag} ${JSON.stringify(payload)}\n`);
  } catch { /* ignore */ }
}

/** Mouse-wheel step in rows per tick. */
const WHEEL_ROWS_PER_TICK = 3;

/**
 * Variable-height scrollable container.
 *
 * Lays out a list of items inside a measured viewport and clips with
 * `overflow: hidden`. Row heights are supplied by the caller via the
 * optional `getRowHeight` prop (defaults to `1` per item — correct for
 * single-line lists). The view itself measures only the viewport, so it
 * has exactly one layout subscriber and never causes measurement loops.
 *
 * The view does **not** handle keyboard input. Use {@link ScrollableList}
 * for keyboard-driven single-selection lists.
 *
 * @example
 * ```tsx
 * <ScrollableView
 *   id="messages"
 *   items={messages}
 *   getKey={(message) => message.id}
 *   getRowHeight={(message) => message.lineCount}
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
    getRowHeight,
    scrollToRow,
    stickToBottom = false,
    onScrollChange,
    emptyText = "No items.",
  } = props;

  const theme = useScrollableViewTheme();
  const totalCount = items.length;

  // Single layout subscriber — the viewport itself.
  const viewportRef = useRef<DOMElement | null>(null);
  const { height: viewportHeight, width: viewportWidth } = useBoxMetrics(
    viewportRef as RefObject<DOMElement>,
  );

  /** Resolves a row's height. Defaults to 1 row per item. */
  const rowHeight = useCallback(
    (index: number): number => {
      const item = items[index];
      if (item === undefined) return 0;
      // Pass `viewportWidth` so callers that rely on soft-wrap aware
      // measurement (e.g. `MessageList`) get accurate row counts. When
      // the viewport hasn't been measured yet, `viewportWidth` is 0;
      // callers must handle that gracefully (typically by falling back
      // to a hard-newline count).
      return getRowHeight
        ? Math.max(0, getRowHeight(item, index, viewportWidth))
        : 1;
    },
    [items, getRowHeight, viewportWidth],
  );

  // Total content extent in rows.
  const totalRows = useMemo(() => {
    let sum = 0;
    for (let index = 0; index < totalCount; index += 1) {
      sum += rowHeight(index);
    }
    if (stickToBottom && totalCount > 0) {
      const lastHeight = rowHeight(totalCount - 1);
      _debugLog("[ScrollableView] totalRows recalc", {
        totalCount,
        totalRows: sum,
        viewportHeight,
        maxOffset: Math.max(0, sum - viewportHeight),
        lastItemHeight: lastHeight,
        rowHeights: Array.from({ length: Math.min(totalCount, 10) }, (_, i) =>
          rowHeight(totalCount - Math.min(totalCount, 10) + i),
        ),
      });
    }
    return sum;
  }, [totalCount, rowHeight, stickToBottom, viewportHeight]);

  /** Top edge (in rows) of the row at `index`. */
  const rowTop = useCallback(
    (index: number): number => {
      let top = 0;
      for (let cursor = 0; cursor < index; cursor += 1) {
        top += rowHeight(cursor);
      }
      return top;
    },
    [rowHeight],
  );

  const maxOffset = Math.max(0, totalRows - viewportHeight);

  // Scroll offset in *rows*. Single source of truth.
  const [rowOffset, setRowOffset] = useState(0);

  // Tracks whether the user is currently pinned to the bottom.
  const isPinnedRef = useRef(true);

  // Pin-to-bottom — establishes the initial pin and re-pins on commits
  // while the user is at the bottom. Wheel handler clears the flag when
  // the user scrolls away.
  useEffect(() => {
    if (!stickToBottom) return;
    if (totalCount === 0 || viewportHeight <= 0) return;
    if (!isPinnedRef.current) return;
    setRowOffset((current) => {
      if (current === maxOffset) return current;
      return maxOffset;
    });
  }, [stickToBottom, maxOffset, totalCount, viewportHeight]);

  // scrollToRow — keep the requested row visible.
  useEffect(() => {
    if (scrollToRow === undefined) return;
    if (totalCount === 0 || viewportHeight <= 0) return;
    const index = Math.max(0, Math.min(scrollToRow, totalCount - 1));
    const top = rowTop(index);
    const height = rowHeight(index);
    setRowOffset((current) => {
      let next = Math.min(current, maxOffset);
      if (top < next) {
        next = top;
      } else if (top + height > next + viewportHeight) {
        next = top + height - viewportHeight;
      }
      const clamped = Math.max(0, Math.min(next, maxOffset));
      return clamped;
    });
  }, [scrollToRow, totalCount, viewportHeight, maxOffset, rowTop, rowHeight]);

  // Clamp offset when content shrinks.
  useEffect(() => {
    setRowOffset((current) => {
      const next = Math.min(current, maxOffset);
      return next;
    });
  }, [maxOffset]);

  // Notify the parent on any change to scroll state.
  useEffect(() => {
    if (onScrollChange === undefined) return;
    onScrollChange({
      rowOffset,
      totalRows,
      viewportRows: viewportHeight,
      atBottom: rowOffset >= maxOffset,
    });
  }, [onScrollChange, rowOffset, totalRows, viewportHeight, maxOffset]);

  // Mouse wheel — scoped to the viewport box; fires regardless of focus.
  useMouseWheelScroll({
    ref: viewportRef,
    onScroll: (event) => {
      if (totalCount === 0) return;
      setRowOffset((current) => {
        const delta =
          event.direction === "up"
            ? -WHEEL_ROWS_PER_TICK
            : WHEEL_ROWS_PER_TICK;
        const next = Math.max(0, Math.min(current + delta, maxOffset));
        isPinnedRef.current = next >= maxOffset;
        return next;
      });
    },
  });

  if (totalCount === 0) {
    return (
      <Box {...theme.empty}>
        <Text {...theme.emptyText}>{emptyText}</Text>
      </Box>
    );
  }

  const showScrollbar = viewportHeight > 0 && totalRows > viewportHeight;

  return (
    <Box {...theme.outer}>
      <Box ref={viewportRef} {...theme.viewport}>
        <Box
          flexDirection="column"
          position="absolute"
          width="100%"
          marginTop={-rowOffset}
        >
          {items.map((item, index) => (
            <Box
              key={getKey(item, index)}
              flexShrink={0}
              width="100%"
              flexDirection="column"
            >
              {renderItem(item, index)}
            </Box>
          ))}
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
