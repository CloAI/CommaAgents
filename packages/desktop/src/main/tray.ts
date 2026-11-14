import { join } from "node:path";
import { app, Menu, nativeImage, Tray } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type { DaemonRuntimeStatus } from "./daemon-runtime";

/** One line of the tray menu, independent of Electron. */
type TrayMenuItem =
  | {
      readonly kind: "action";
      readonly id: "toggle-window" | "quit";
      readonly label: string;
    }
  | { readonly kind: "status"; readonly label: string }
  | { readonly kind: "separator" };

/** What the tray menu reflects. */
interface TrayState {
  readonly windowVisible: boolean;
  readonly status: DaemonRuntimeStatus;
  /** Top-level runs executing now. */
  readonly activeRuns: number;
}

const REFRESH_MS = 3000;

/**
 * Describe the tray menu for the current state.
 * @param {TrayState} state - Window, daemon and run state.
 * @returns {readonly TrayMenuItem[]} Menu lines, top to bottom.
 */
export function trayMenuTemplate({
  windowVisible,
  status,
  activeRuns,
}: TrayState): readonly TrayMenuItem[] {
  const runs = `${activeRuns} run${activeRuns === 1 ? "" : "s"}`;
  const daemon =
    status.kind === "starting"
      ? "Daemon starting…"
      : status.kind === "failed"
        ? `Daemon failed: ${status.message}`
        : activeRuns > 0
          ? `Daemon running · ${runs} active`
          : "Daemon running";
  return [
    {
      kind: "action",
      id: "toggle-window",
      label: windowVisible ? "Hide Comma Agents" : "Show Comma Agents",
    },
    { kind: "status", label: daemon },
    { kind: "separator" },
    {
      kind: "action",
      id: "quit",
      label:
        activeRuns > 0
          ? `Quit (stops the daemon and ${runs})`
          : "Quit (stops the daemon)",
    },
  ];
}

/** The tray icon the application keeps up to date. */
interface TrayHandle {
  /** Rebuild the menu now, if anything it shows has changed. */
  refresh(): void;
  /** Remove the icon and stop refreshing. */
  destroy(): void;
}

/** What the tray reads and does. */
interface CreateTrayOptions {
  readonly readState: () => TrayState;
  readonly onToggleWindow: () => void;
  readonly onQuit: () => void;
}

/**
 * Show a tray icon whose menu follows the daemon and its runs.
 * @param {CreateTrayOptions} options - State source and actions.
 * @returns {TrayHandle} Refresh and removal controls.
 */
export function createTray({
  readState,
  onToggleWindow,
  onQuit,
}: CreateTrayOptions): TrayHandle {
  // A tray@2x.png beside the file is picked up automatically for high-density displays.
  const tray = new Tray(
    nativeImage.createFromPath(join(app.getAppPath(), "assets", "tray.png")),
  );
  tray.setToolTip("Comma Agents");
  if (process.platform !== "darwin") {
    // On macOS a click opens the menu instead.
    tray.on("click", onToggleWindow);
  }

  const toMenuItem = (item: TrayMenuItem): MenuItemConstructorOptions => {
    if (item.kind === "separator") {
      return { type: "separator" };
    }
    if (item.kind === "status") {
      return { label: item.label, enabled: false };
    }
    return {
      label: item.label,
      click: item.id === "quit" ? onQuit : onToggleWindow,
    };
  };
  let shown: string | undefined;
  const refresh = () => {
    const items = trayMenuTemplate(readState());
    const key = JSON.stringify(items);
    if (key !== shown) {
      shown = key;
      tray.setContextMenu(Menu.buildFromTemplate(items.map(toMenuItem)));
    }
  };
  refresh();
  // Run counts change inside the daemon, which does not announce them, so poll.
  const timer = setInterval(refresh, REFRESH_MS);
  return {
    refresh,
    destroy() {
      clearInterval(timer);
      tray.destroy();
    },
  };
}
