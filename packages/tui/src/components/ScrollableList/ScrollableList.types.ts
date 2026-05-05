import type React from "react";

/**
 * Props for {@link ScrollableList}.
 *
 * `ScrollableList` is a focused, single-selection list with arrow-key
 * navigation, mouse-wheel scrolling, and a row-aware vertical scrollbar.
 * Each rendered row is measured at commit time so multi-line items
 * participate correctly in both the visible-window math and the scrollbar
 * geometry — the caller does not have to declare row heights.
 */
export interface ScrollableListProps<ItemType> {
  /** The full list of items to render. */
  readonly items: readonly ItemType[];
  /** Stable key for each item. */
  readonly getKey: (item: ItemType, index: number) => string;
  /**
   * Renders a single row. Receives the item and a flag indicating whether
   * this row is currently selected — the caller is responsible for any
   * visual selection treatment (typically `inverse` text).
   */
  readonly renderItem: (
    item: ItemType,
    isSelected: boolean,
  ) => React.ReactNode;
  /** Currently selected index (controlled). Clamped to `[0, items.length-1]`. */
  readonly selectedIndex: number;
  /** Invoked when Up/Down moves the selection. */
  readonly onSelectedIndexChange: (next: number) => void;
  /** Invoked when Enter is pressed on the selected item. */
  readonly onSelected?: (item: ItemType, index: number) => void;
  /** Text shown when `items` is empty. Defaults to "No items." */
  readonly emptyText?: string;
  /**
   * Stable focus ID. When omitted the list still participates in tab order
   * but cannot be focused programmatically by name.
   */
  readonly id?: string;
  /**
   * External focus override. When provided, the list does NOT register its
   * own focus zone via `useFocus` — the parent owns the focus state and
   * passes `true` to enable arrow-key + mouse-wheel input. This lets a
   * larger surrounding region (e.g. a sidebar) act as a single focus zone
   * containing the list, instead of forcing the user to tab into the list
   * separately.
   */
  readonly isFocused?: boolean;
}
