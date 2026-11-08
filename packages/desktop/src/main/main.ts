import { app, BrowserWindow, ipcMain } from "electron";
import { loadDaemonConfig } from "@daemon-src/config";
import { startDaemonElectronRuntime } from "./daemon-runtime";
import {
  createMainWindow,
  handleWindowControls,
  rendererUrl,
  trustedUrlChecker,
} from "./window";
import { desktopConfigFile } from "./window-state";

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const isTrusted = trustedUrlChecker(rendererUrl());
  const stateFile = desktopConfigFile();
  let window: BrowserWindow | undefined;

  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) {
        window.restore();
      }
      window.focus();
    }
  });

  void app.whenReady().then(() => {
    const daemon = startDaemonElectronRuntime(loadDaemonConfig(), {
      ipcMain,
      isTrusted,
    });
    handleWindowControls(ipcMain, isTrusted);
    window = createMainWindow(stateFile);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        window = createMainWindow(stateFile);
      }
    });
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });
    // Hold quitting until the daemon has disposed, then quit for real.
    let stopped = false;
    app.on("before-quit", (event) => {
      if (stopped) {
        return;
      }
      event.preventDefault();
      void daemon.stop().finally(() => {
        stopped = true;
        app.quit();
      });
    });
  });
}
