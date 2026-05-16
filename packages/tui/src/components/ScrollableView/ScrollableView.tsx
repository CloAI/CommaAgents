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
import type {
  ScrollableViewProps,
  ScrollableViewRenderProps,
} from "./ScrollableView.types";

const _DEBUG_FILE = join(tmpdir(), "comma-agents-chat-debug.log");
function _debugLog(tag: string, payload: unknown): void {
  try {
    appendFileSync(
      _DEBUG_FILE,
      `[${new Date().toISOString()}] ${tag} ${JSON.stringify(payload)}\n`,
    );
  } catch {
    /* ignore */
  }
}

const WHEEL_ROWS_PER_TICK = 3;

interface MeasuredRowProps<ItemType> {
  readonly item: ItemType;
  readonly index: number;
  readonly renderItem: (item: ItemType, index: number) => React.ReactNode;
  readonly onMeasured: (index: number, height: number) => void;
}

function MeasuredRow<ItemType>({
  item,
  index,
  renderItem,
  onMeasured,
}: MeasuredRowProps<ItemType>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  const { height, hasMeasured } = useBoxMetrics(ref as RefObject<DOMElement>);

  useEffect(() => {
    if (hasMeasured) {
      onMeasured(index, height);
    }
  }, [hasMeasured, height, index, onMeasured]);

  return (
    <Box ref={ref} flexShrink={0} width="100%" flexDirection="column">
      {renderItem(item, index)}
    </Box>
  );
}

/**
 * Variable-height scrollable container.
 *
 * Lays out a list of items inside a measured viewport and clips with
 * `overflow: hidden`. Each row is measured via Ink's `useBoxMetrics`
 * after layout so scroll geometry uses real rendered heights rather than
 * relying solely on the caller's `getRowHeight` estimate. The estimate
 * serves as a fallback before the first measurement arrives.
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

  const measuredHeightsRef = useRef(new Map<number, number>());
  const [measurementVersion, setMeasurementVersion] = useState(0);

  const onRowMeasured = useCallback((index: number, height: number) => {
    const currentHeight = measuredHeightsRef.current.get(index);
    if (currentHeight === height) return;
    measuredHeightsRef.current.set(index, height);
    setMeasurementVersion((v) => v + 1);
  }, []);

  const totalCount = items.length;

  const viewportRef = useRef<DOMElement | null>(null);
  const { height: viewportHeight, width: viewportWidth } = useBoxMetrics(
    viewportRef as RefObject<DOMElement>,
  );

  const rowHeight = useCallback(
    (index: number): number => {
      const measured = measuredHeightsRef.current.get(index);
      if (measured !== undefined) return measured;

      const item = items[index];
      if (item === undefined) return 0;
      return getRowHeight
        ? Math.max(0, getRowHeight(item, index, viewportWidth))
        : 1;
    },
    [items, getRowHeight, viewportWidth],
  );

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
  }, [
    totalCount,
    rowHeight,
    stickToBottom,
    viewportHeight,
    measurementVersion,
  ]);

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

  const [rowOffset, setRowOffset] = useState(0);

  const isPinnedRef = useRef(true);

  useEffect(() => {
    if (!stickToBottom) return;
    if (totalCount === 0 || viewportHeight <= 0) return;
    if (!isPinnedRef.current) return;
    setRowOffset((current) => {
      if (current === maxOffset) return current;
      return maxOffset;
    });
  }, [stickToBottom, maxOffset, totalCount, viewportHeight]);

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

  useEffect(() => {
    setRowOffset((current) => {
      const next = Math.min(current, maxOffset);
      return next;
    });
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
        const delta =
          event.direction === "up" ? -WHEEL_ROWS_PER_TICK : WHEEL_ROWS_PER_TICK;
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
      showScrollbar={showScrollbar}
      emptyText={emptyText}
      theme={theme}
      viewportRef={viewportRef}
      onRowMeasured={onRowMeasured}
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
  showScrollbar,
  emptyText,
  theme,
  viewportRef,
  onRowMeasured,
}: ScrollableViewRenderProps<ItemType>): React.ReactElement {
  if (totalCount === 0) {
    return (
      <Box {...theme.empty}>
        <Text {...theme.emptyText}>{emptyText}</Text>
      </Box>
    );
  }

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
            <MeasuredRow
              key={getKey(item, index)}
              item={item}
              index={index}
              renderItem={renderItem}
              onMeasured={onRowMeasured}
            />
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
