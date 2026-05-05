import { useFocus, useInput } from "ink";
import type React from "react";

import { ScrollableView } from "../ScrollableView";

import type { ScrollableListProps } from "./ScrollableList.types";

/** Raw-mode availability — required for `useInput` and `useFocus`. */
const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

/** Clamp `index` into `[0, length-1]`; returns 0 when length \<= 0. */
function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
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
export function ScrollableList<ItemType>(
  props: ScrollableListProps<ItemType>,
): React.ReactElement {
  const {
    items,
    getKey,
    renderItem,
    selectedIndex,
    onSelectedIndexChange,
    onSelected,
    emptyText,
    id,
    isFocused: externalFocused,
  } = props;

  const totalCount = items.length;
  const clampedSelected = clampIndex(selectedIndex, totalCount);

  // Skip our own focus zone when the parent supplies one via `isFocused`.
  const ownFocus = useFocus({
    id,
    isActive: RAW_MODE_SUPPORTED && externalFocused === undefined,
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
    <ScrollableView<ItemType>
      items={items}
      getKey={getKey}
      emptyText={emptyText}
      scrollToRow={clampedSelected}
      renderItem={(item, index) => renderItem(item, index === clampedSelected)}
    />
  );
}
