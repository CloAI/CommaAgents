import { describe, expect, it, vi } from "vitest";
import type {
  BrowserWindow,
  ContextMenuParams,
  MenuItemConstructorOptions,
} from "electron";

const { popup, buildFromTemplate, openExternal } = vi.hoisted(() => ({
  popup: vi.fn(),
  buildFromTemplate: vi.fn(),
  openExternal: vi.fn(),
}));
vi.mock("electron", () => ({
  Menu: { buildFromTemplate },
  shell: { openExternal },
}));
const { installContextMenu } = await import("./context-menu");

function contextMenu(params: Partial<ContextMenuParams>) {
  const replaceMisspelling = vi.fn();
  const addWordToSpellCheckerDictionary = vi.fn();
  let show: ((_event: unknown, params: ContextMenuParams) => void) | undefined;
  const window = {
    webContents: {
      on: (_name: string, listener: typeof show) => {
        show = listener;
      },
      replaceMisspelling,
      session: { addWordToSpellCheckerDictionary },
    },
  } as unknown as BrowserWindow;
  let items: MenuItemConstructorOptions[] = [];
  buildFromTemplate.mockImplementation(
    (template: MenuItemConstructorOptions[]) => {
      items = template;
      return { popup };
    },
  );
  popup.mockClear();
  installContextMenu(window);
  show?.(undefined, {
    isEditable: false,
    selectionText: "",
    linkURL: "",
    misspelledWord: "",
    dictionarySuggestions: [],
    editFlags: {
      canUndo: true,
      canRedo: false,
      canCut: true,
      canCopy: true,
      canPaste: true,
      canSelectAll: true,
    },
    ...params,
  } as ContextMenuParams);
  return { items, replaceMisspelling, addWordToSpellCheckerDictionary };
}

describe("installContextMenu", () => {
  it("should offer native editing and apply spelling suggestions and dictionary additions", () => {
    const { items, replaceMisspelling, addWordToSpellCheckerDictionary } =
      contextMenu({
        isEditable: true,
        misspelledWord: "helo",
        dictionarySuggestions: ["hello"],
      });
    expect(items.map((item) => item.role).filter(Boolean)).toEqual([
      "undo",
      "redo",
      "cut",
      "copy",
      "paste",
      "selectAll",
    ]);
    expect(items.find((item) => item.role === "redo")?.enabled).toBe(false);
    const suggestion = items.find((item) => item.label === "hello");
    const dictionary = items.find((item) => item.label === "Add to dictionary");
    if (suggestion?.click) {
      Reflect.apply(suggestion.click, undefined, []);
    }
    if (dictionary?.click) {
      Reflect.apply(dictionary.click, undefined, []);
    }
    expect(replaceMisspelling).toHaveBeenCalledWith("hello");
    expect(addWordToSpellCheckerDictionary).toHaveBeenCalledWith("helo");
    expect(popup).toHaveBeenCalledOnce();
  });

  it("should allow copying selected output without offering editing actions", () => {
    expect(contextMenu({ selectionText: "response" }).items).toEqual([
      { role: "copy", enabled: true },
    ]);
  });

  it("should offer browser actions only for web links and skip empty menus", () => {
    expect(
      contextMenu({ linkURL: "https://example.com" }).items[0]?.label,
    ).toBe("Open link in browser");
    expect(contextMenu({ linkURL: "file:///etc/passwd" }).items).toEqual([]);
    expect(popup).not.toHaveBeenCalled();
  });
});
