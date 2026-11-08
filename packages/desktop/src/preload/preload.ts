import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  DaemonClosedEvent,
  DaemonMessageEvent,
  DesktopBridge,
  OpenResult,
  WindowCommand,
} from "../shared/ipc";

/**
 * Subscribe to a main-to-renderer channel without leaking the IPC event object.
 * @param {string} channel - Channel to listen on.
 * @param {(payload: Payload) => void} listener - Receives each payload.
 * @returns {() => void} Unsubscribe function.
 */
function listen<Payload>(
  channel: string,
  listener: (payload: Payload) => void,
): () => void {
  const handler = (_event: IpcRendererEvent, payload: Payload) =>
    listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

/**
 * Treat every platform other than macOS and Windows as Linux-like.
 * @param {NodeJS.Platform} platform - Node's platform name.
 * @returns {DesktopBridge["platform"]} A platform the renderer understands.
 */
function platformOf(platform: NodeJS.Platform): DesktopBridge["platform"] {
  return platform === "darwin" || platform === "win32" ? platform : "linux";
}

// Fixed, typed entry points only; the renderer never sees `ipcRenderer`.
const bridge: DesktopBridge = {
  platform: platformOf(process.platform),
  daemon: {
    open: (): Promise<OpenResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.daemonOpen),
    send: (id, text) => ipcRenderer.send(IPC_CHANNELS.daemonSend, id, text),
    close: (id) => ipcRenderer.send(IPC_CHANNELS.daemonClose, id),
    onMessage: (listener) =>
      listen<DaemonMessageEvent>(IPC_CHANNELS.daemonMessage, listener),
    onClosed: (listener) =>
      listen<DaemonClosedEvent>(IPC_CHANNELS.daemonClosed, listener),
  },
  windowControls: {
    run: (command: WindowCommand) =>
      ipcRenderer.send(IPC_CHANNELS.windowControl, command),
    isMaximized: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.windowIsMaximized),
    onMaximizedChange: (listener) =>
      listen<boolean>(IPC_CHANNELS.windowMaximized, listener),
  },
};

contextBridge.exposeInMainWorld("commaDesktop", bridge);
