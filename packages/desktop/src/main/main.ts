import { app, BrowserWindow, dialog, ipcMain, powerMonitor } from "electron";
import { loadDaemonConfig } from "@daemon-src/config";
import { startDaemonElectronRuntime } from "./daemon-runtime";
import { desktopConfigFile } from "./desktop-config";
import {
  createDesktopSettings,
  handleDesktopSettings,
} from "./desktop-settings";
import { confirmQuit } from "./quit";
import { createTray } from "./tray";
import { createWorkspace } from "./workspace";
import { handleDirectorySelection } from "./directory";
import {
  createMainWindow,
  handleWindowControls,
  rendererUrl,
  trustedUrlChecker,
} from "./window";

/** Argument a login launch passes so the app starts hidden in the tray. */
const HIDDEN_FLAG = "--hidden";

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const isTrusted = trustedUrlChecker(rendererUrl());
  const stateFile = desktopConfigFile();
  let window: BrowserWindow | undefined;
  let tray: ReturnType<typeof createTray> | undefined;
  let workspace: ReturnType<typeof createWorkspace> | undefined;
  // open -> deciding (a dialog may be showing) -> stopping (daemon shutting down) -> stopped
  let quitState: "open" | "deciding" | "stopping" | "stopped" = "open";
  let systemShutdown = false;

  app.on("second-instance", () => {
    if (window) {
      workspace?.showAll();
    }
  });

  void app.whenReady().then(() => {
    const daemon = startDaemonElectronRuntime(loadDaemonConfig(), {
      ipcMain,
      isTrusted,
    });
    const settings = createDesktopSettings({
      file: stateFile,
      platform: process.platform,
      loginItem: {
        packaged: app.isPackaged,
        isEnabled: () =>
          app.getLoginItemSettings({ args: [HIDDEN_FLAG] }).openAtLogin,
        setEnabled: (openAtLogin) =>
          app.setLoginItemSettings({ openAtLogin, args: [HIDDEN_FLAG] }),
      },
    });
    // A system shutdown or logout must never wait on a dialog (macOS and Linux; Windows is below).
    powerMonitor.on("shutdown", () => {
      systemShutdown = true;
    });
    handleDesktopSettings(ipcMain, settings, isTrusted);
    handleWindowControls(ipcMain, isTrusted);
    handleDirectorySelection(isTrusted);
    workspace = createWorkspace({
      stateFile,
      isTrusted,
      isQuitting: () => quitState === "stopping" || quitState === "stopped",
    });

    const toggleWindow = () => {
      if (window?.isVisible()) {
        workspace?.hideAll();
      } else if (window) {
        workspace?.showAll();
      }
    };
    try {
      tray = createTray({
        readState: () => ({
          windowVisible: window?.isVisible() ?? false,
          status: daemon.status(),
          activeRuns: daemon.activeRuns(),
        }),
        onToggleWindow: toggleWindow,
        onQuit: () => app.quit(),
      });
    } catch {
      // Without a tray there is no way back to a hidden window, so never hide it.
      tray = undefined;
    }

    const openWindow = () => {
      const created = createMainWindow(stateFile, {
        startHidden: process.argv.includes(HIDDEN_FLAG) && tray !== undefined,
        onVisibilityChange: () => tray?.refresh(),
        onClose(event) {
          if (quitState === "stopping" || quitState === "stopped") {
            return;
          }
          event.preventDefault();
          if (settings.keepRunning() && tray) {
            workspace?.hideAll();
          } else {
            app.quit();
          }
        },
      });
      created.on("session-end", () => {
        systemShutdown = true;
      });
      return created;
    };
    window = openWindow();
    workspace.attachMain(
      window,
      process.argv.includes(HIDDEN_FLAG) && tray !== undefined,
    );

    app.on("activate", () => {
      if (window && !window.isDestroyed()) {
        workspace?.showAll();
      } else {
        window = openWindow();
        workspace?.attachMain(window, false);
      }
    });

    // Quitting stops the daemon and every run, so ask first when runs are active.
    const askToQuit = async (): Promise<boolean> =>
      systemShutdown ||
      confirmQuit(daemon.activeRuns(), async (options) => {
        const { response } = await (window?.isVisible()
          ? dialog.showMessageBox(window, options)
          : dialog.showMessageBox(options));
        return response;
      });
    app.on("before-quit", (event) => {
      if (quitState === "stopped") {
        return;
      }
      event.preventDefault();
      if (quitState !== "open") {
        return;
      }
      quitState = "deciding";
      void askToQuit().then(async (confirmed) => {
        if (!confirmed) {
          quitState = "open";
          return;
        }
        quitState = "stopping";
        workspace?.save();
        tray?.destroy();
        try {
          await daemon.stop();
        } finally {
          quitState = "stopped";
          app.quit();
        }
      });
    });
  });
}
