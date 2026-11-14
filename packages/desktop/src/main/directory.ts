import { BrowserWindow, dialog, ipcMain } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";

/**
 * Register the trusted renderer's native project directory picker.
 * @param {(url: string | undefined) => boolean} isTrusted - Whether the requesting frame belongs to the application.
 * @returns {void} Registers the directory selection handler.
 * @example
 * handleDirectorySelection(isTrusted);
 */
export function handleDirectorySelection(
  isTrusted: (url: string | undefined) => boolean,
): void {
  ipcMain.handle(
    IPC_CHANNELS.chooseDirectory,
    async (event, initialDirectory: unknown) => {
      if (!isTrusted(event.senderFrame?.url)) {
        throw new Error("Untrusted directory selection sender");
      }
      if (
        initialDirectory !== undefined &&
        (typeof initialDirectory !== "string" ||
          initialDirectory.includes("\0"))
      ) {
        throw new Error("Invalid initial directory");
      }
      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: "Choose workspace directory",
        defaultPath: initialDirectory as string | undefined,
        properties: ["openDirectory", "createDirectory"] as (
          | "openDirectory"
          | "createDirectory"
        )[],
      };
      const result = await (ownerWindow
        ? dialog.showOpenDialog(ownerWindow, options)
        : dialog.showOpenDialog(options));
      return result.canceled ? undefined : result.filePaths[0];
    },
  );
}
