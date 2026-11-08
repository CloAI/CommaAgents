import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BrowserWindow, screen, shell } from "electron";
import type { IpcMain } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type { WindowCommand } from "../shared/ipc";
import {
  fitToDisplays,
  readWindowState,
  writeWindowState,
} from "./window-state";

const SAVE_DELAY_MS = 400;

/**
 * Build a check that a frame URL belongs to the application's own renderer.
 * @param {string} appUrl - Dev server URL or built `index.html` file URL.
 * @returns {(url: string | undefined) => boolean} Whether the URL, ignoring its hash, is the application.
 */
export function trustedUrlChecker(
  appUrl: string,
): (url: string | undefined) => boolean {
  const app = new URL(appUrl);
  return (url) => {
    if (!url) {
      return false;
    }
    try {
      const candidate = new URL(url);
      return app.protocol === "file:"
        ? candidate.protocol === "file:" && candidate.pathname === app.pathname
        : candidate.origin === app.origin;
    } catch {
      return false;
    }
  };
}

/**
 * Locate the page the main window shows.
 * @returns {string} The dev server URL during development, otherwise the built page's file URL.
 */
export function rendererUrl(): string {
  return (
    process.env.ELECTRON_RENDERER_URL ??
    pathToFileURL(join(import.meta.dirname, "../renderer/index.html")).href
  );
}

/**
 * Create the main window with a hardened renderer and restored placement.
 * @param {string} stateFile - Desktop configuration file holding the window placement.
 * @returns {BrowserWindow} The window, already loading the application.
 */
export function createMainWindow(stateFile: string): BrowserWindow {
  const url = rendererUrl();
  const isTrusted = trustedUrlChecker(url);
  const state = fitToDisplays(
    readWindowState(stateFile),
    screen.getAllDisplays().map((display) => display.workArea),
  );
  const window = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 480,
    minHeight: 360,
    show: false,
    // The renderer draws the title bar and its window controls.
    frame: false,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Only the application's own page may load; links open in the default browser.
  const openExternally = (target: string) => {
    if (/^https?:\/\//i.test(target)) {
      void shell.openExternal(target);
    }
  };
  window.webContents.on("will-navigate", (event, target) => {
    if (!isTrusted(target)) {
      event.preventDefault();
      openExternally(target);
    }
  });
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    openExternally(target);
    return { action: "deny" };
  });
  window.webContents.session.setPermissionRequestHandler((_, __, deny) =>
    deny(false),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    clearTimeout(timer);
    const maximized = window.isMaximized();
    // A maximized window keeps its restored bounds, so un-maximizing returns to them.
    const bounds = maximized ? window.getNormalBounds() : window.getBounds();
    try {
      writeWindowState(stateFile, { ...bounds, maximized });
    } catch {
      // Losing placement is harmless; never block closing the window.
    }
  };
  const scheduleSave = () => {
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  };
  window.on("resize", scheduleSave);
  window.on("move", scheduleSave);
  window.on("close", save);
  const reportMaximized = () =>
    window.webContents.send(IPC_CHANNELS.windowMaximized, window.isMaximized());
  window.on("maximize", reportMaximized);
  window.on("unmaximize", reportMaximized);

  window.once("ready-to-show", () => {
    if (state.maximized) {
      window.maximize();
    }
    window.show();
  });
  void (url.startsWith("file:")
    ? window.loadFile(join(import.meta.dirname, "../renderer/index.html"))
    : window.loadURL(url));
  return window;
}

const WINDOW_COMMANDS: readonly WindowCommand[] = [
  "minimize",
  "toggleMaximize",
  "close",
];

/**
 * Accept only the window commands the title bar can send.
 * @param {unknown} value - Untrusted IPC payload.
 * @returns {WindowCommand | undefined} The command, or undefined for anything else.
 */
export function parseWindowCommand(value: unknown): WindowCommand | undefined {
  return WINDOW_COMMANDS.find((command) => command === value);
}

/**
 * Let the renderer's title bar control its own window.
 * @param {IpcMain} ipcMain - IPC hub of the main process.
 * @param {(url: string | undefined) => boolean} isTrusted - Sender trust check.
 * @returns {void}
 */
export function handleWindowControls(
  ipcMain: IpcMain,
  isTrusted: (url: string | undefined) => boolean,
): void {
  ipcMain.on(IPC_CHANNELS.windowControl, (event, payload: unknown) => {
    const command = parseWindowCommand(payload);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!command || !window || !isTrusted(event.senderFrame?.url)) {
      return;
    }
    if (command === "minimize") {
      window.minimize();
    } else if (command === "close") {
      window.close();
    } else if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });
  ipcMain.handle(IPC_CHANNELS.windowIsMaximized, (event) =>
    isTrusted(event.senderFrame?.url)
      ? (BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false)
      : false,
  );
}
