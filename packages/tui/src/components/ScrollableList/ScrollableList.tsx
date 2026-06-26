import { useFocus, useInput } from "ink";
import type React from "react";

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
    (_input, key) => {
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
      if (key.return && onSelected !== undefined) {
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
  /** Selected index after clamping. */
  readonly clampedSelected: number;
  /** Empty-state text. */
  readonly emptyText?: string;
}

export function ScrollableListRender<ItemType>({
  items,
  getKey,
  renderItem,
  clampedSelected,
  emptyText,
}: ScrollableListRenderProps<ItemType>): React.ReactElement {
  return (
    <ScrollableView<ItemType>
      items={items}
      getKey={getKey}
      emptyText={emptyText}
      scrollToRow={clampedSelected}
      renderItem={(item, index) => renderItem(item, index === clampedSelected)}
    />
  );
}
