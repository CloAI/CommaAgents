import { Menu, shell } from "electron";
import type { BrowserWindow, MenuItemConstructorOptions } from "electron";

/**
 * Install native editing, spelling, selection, and link actions for a window.
 * @param {BrowserWindow} window - Window receiving right-click actions.
 * @returns {void} Nothing.
 */
export function installContextMenu(window: BrowserWindow): void {
  window.webContents.on("context-menu", (_event, params) => {
    const items: MenuItemConstructorOptions[] = [];
    if (params.isEditable) {
      if (params.misspelledWord) {
        items.push(
          ...params.dictionarySuggestions.map((suggestion) => ({
            label: suggestion,
            click: () => window.webContents.replaceMisspelling(suggestion),
          })),
          {
            label: "Add to dictionary",
            click: () =>
              window.webContents.session.addWordToSpellCheckerDictionary(
                params.misspelledWord,
              ),
          },
          { type: "separator" },
        );
      }
      items.push(
        { role: "undo", enabled: params.editFlags.canUndo },
        { role: "redo", enabled: params.editFlags.canRedo },
        { type: "separator" },
        { role: "cut", enabled: params.editFlags.canCut },
        { role: "copy", enabled: params.editFlags.canCopy },
        { role: "paste", enabled: params.editFlags.canPaste },
        { role: "selectAll", enabled: params.editFlags.canSelectAll },
      );
    } else if (params.selectionText) {
      items.push({ role: "copy", enabled: params.editFlags.canCopy });
    }
    if (/^https?:\/\//i.test(params.linkURL)) {
      if (items.length > 0) {
        items.push({ type: "separator" });
      }
      items.push({
        label: "Open link in browser",
        click: () => {
          void shell.openExternal(params.linkURL);
        },
      });
    }
    if (items.length > 0) {
      Menu.buildFromTemplate(items).popup({ window });
    }
  });
}
