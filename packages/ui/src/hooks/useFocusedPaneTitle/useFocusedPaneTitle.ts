import { paneTitle } from "../../components/ChatPane/ChatPane.utils";
import { listPanes, useLayout } from "../useLayout";
import type { Layout } from "../useLayout";

/**
 * Name the focused pane's content.
 * @param {Layout} layout - The pane grid.
 * @returns {string} The focused pane's title, "New chat" when no pane is found.
 */
export function focusedPaneTitle(layout: Layout): string {
  const focused = listPanes(layout.root).find(
    (pane) => pane.id === layout.activeId,
  );
  return paneTitle(focused?.path ?? "/");
}

/**
 * Follow the title of the focused pane, for chrome outside the workspace.
 * @returns {string} The focused pane's title.
 */
export function useFocusedPaneTitle(): string {
  return focusedPaneTitle(useLayout().layout);
}
