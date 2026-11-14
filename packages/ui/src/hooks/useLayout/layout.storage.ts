import { NEW_CHAT_PATH, createLayout, setPanePath } from "./layout";
import type { Layout } from "./layout.types";
import { parseLayout, serializeLayout } from "./layout.serialization";
export { parseLayout, serializeLayout } from "./layout.serialization";

/** Browser storage key of the saved layout. */
export const LAYOUT_STORAGE_KEY = "comma-agents.layout";

/**
 * Read the saved layout, or start with one new chat, then open a requested route in the focused pane.
 * @param {string} [initialPath] - Route from the address bar, if any.
 * @returns {Layout} The layout to start with.
 */
export function loadLayout(initialPath?: string): Layout {
  let saved: Layout | undefined;
  try {
    const text = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    saved = text === null ? undefined : parseLayout(text);
  } catch {
    saved = undefined;
  }
  const layout = saved ?? createLayout();
  return initialPath && initialPath !== NEW_CHAT_PATH
    ? setPanePath(layout, layout.activeId, initialPath)
    : layout;
}

/**
 * Save the layout; failures are ignored because the layout still works unsaved.
 * @param {Layout} layout - Layout to save.
 * @returns {void} Nothing.
 */
export function saveLayout(layout: Layout): void {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(layout));
  } catch {
    // Storage may be unavailable or full; the layout simply is not remembered.
  }
}
