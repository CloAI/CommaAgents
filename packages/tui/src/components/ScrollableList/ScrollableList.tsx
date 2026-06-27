import { Box, type DOMElement, useFocus, useInput } from "ink";
import type React from "react";
import { useRef } from "react";

import { useMouseClick } from "../../hooks/useMouseClick";
import { ScrollableView } from "../ScrollableView";
import { clampIndex } from "./ScrollableList.utils";

export interface ScrollableListProps<ItemType> {
  /** Items rendered by the list. */
  readonly items: readonly ItemType[];
  /** Stable key for each item. */
  readonly getKey: (item: ItemType, index: number) => string;
  /** Renderer receiving each item and its selected state. */
  readonly renderItem: (item: ItemType, isSelected: boolean) => React.ReactNode;
  /** Controlled selected index. */
  readonly selectedIndex: number;
  /** Callback invoked when keyboard navigation changes the selection. */
  readonly onSelectedIndexChange: (next: number) => void;
  /** Callback invoked when Enter activates the selected item. */
  readonly onSelected?: (item: ItemType, index: number) => void;
  /** Empty-state text. @default "No items." */
  readonly emptyText?: string;
  /** Stable Ink focus identifier. */
  readonly id?: string;
  /** Parent-controlled focus state. */
  readonly isFocused?: boolean;
}

/**
 * Generic single-selection list with arrow-key navigation and a row-aware
 * vertical scrollbar. Built as a thin selection layer over
 * {@link ScrollableView} — measurement, mouse-wheel handling, and the
 * absolute-positioned viewport all live there. This component adds:
 *
 * - Up/Down arrow keys to move the selection (clamped at the edges).
 * - Enter to invoke the optional `onSelected` callback.
 * - `scrollToRow` plumbed to the view so the selected row is always visible.
 *
 * Mouse-wheel ticks scroll the underlying view independently of the
 * selection — familiar GUI behavior.
 *
 * @example
 * ```tsx
 * const [selected, setSelected] = useState(0);
 * <ScrollableList
 *   id="my-list"
 *   items={commands}
 *   getKey={(c) => c.id}
 *   selectedIndex={selected}
 *   onSelectedIndexChange={setSelected}
 *   onSelected={(c) => run(c)}
 *   renderItem={(c, isSelected) => (
 *     <Text inverse={isSelected}>{c.label}</Text>
 *   )}
 * />
 * ```
 */
export function ScrollableList<ItemType>({
  items,
  getKey,
  renderItem,
  selectedIndex,
  onSelectedIndexChange,
  onSelected,
  emptyText,
  id,
  isFocused: externalFocused,
}: ScrollableListProps<ItemType>): React.ReactElement {
  const totalCount = items.length;
  const clampedSelected = clampIndex(selectedIndex, totalCount);

  const ownFocus = useFocus({
    id,
    isActive: externalFocused === undefined,
  });
  const isFocused = externalFocused ?? ownFocus.isFocused;

  useInput(
    (input, key) => {
      const isReturnInput = key.return || input === "\r" || input === "\n";
      if (totalCount === 0) return;
      if (key.upArrow) {
        if (clampedSelected > 0) onSelectedIndexChange(clampedSelected - 1);
        return;
      }
      if (key.downArrow) {
        if (clampedSelected < totalCount - 1) {
          onSelectedIndexChange(clampedSelected + 1);
        }
        return;
      }
      if (isReturnInput && onSelected !== undefined) {
        const item = items[clampedSelected];
        if (item !== undefined) onSelected(item, clampedSelected);
      }
    },
    { isActive: isFocused },
  );

  return (
    <ScrollableListRender<ItemType>
      items={items}
      getKey={getKey}
      renderItem={renderItem}
      onSelectedIndexChange={onSelectedIndexChange}
      onSelected={onSelected}
      clampedSelected={clampedSelected}
      emptyText={emptyText}
    />
  );
}

export interface ScrollableListRenderProps<ItemType> {
  /** Items rendered by the list. */
  readonly items: readonly ItemType[];
  /** Stable key for each item. */
  readonly getKey: (item: ItemType, index: number) => string;
  /** Renderer receiving each item and its selected state. */
  readonly renderItem: (item: ItemType, isSelected: boolean) => React.ReactNode;
  /** Callback when a row click changes the selected item. */
  readonly onSelectedIndexChange: (next: number) => void;
  /** Callback invoked when a row click activates an item. */
  readonly onSelected?: (item: ItemType, index: number) => void;
  /** Selected index after clamping. */
  readonly clampedSelected: number;
  /** Empty-state text. */
  readonly emptyText?: string;
}

export function ScrollableListRender<ItemType>({
  items,
  getKey,
  renderItem,
  onSelectedIndexChange,
  onSelected,
  clampedSelected,
  emptyText,
}: ScrollableListRenderProps<ItemType>): React.ReactElement {
  return (
    <ScrollableView<ItemType>
      items={items}
      getKey={getKey}
      emptyText={emptyText}
      scrollToRow={clampedSelected}
      renderItem={(item, index) => (
        <ScrollableListRow
          onClick={() => {
            onSelectedIndexChange(index);
            onSelected?.(item, index);
          }}
        >
          {renderItem(item, index === clampedSelected)}
        </ScrollableListRow>
      )}
    />
  );
}

interface ScrollableListRowProps {
  readonly children: React.ReactNode;
  readonly onClick: () => void;
}

function ScrollableListRow({
  children,
  onClick,
}: ScrollableListRowProps): React.ReactElement {
  const rowRef = useRef<DOMElement | null>(null);
  useMouseClick({ ref: rowRef, onClick });
  return (
    <Box ref={rowRef} width="100%" flexDirection="column">
      {children}
    </Box>
  );
}
