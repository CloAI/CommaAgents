/** Fixed IPC channel names shared by the main process and the preload bridge. */
export const IPC_CHANNELS = {
  /** Renderer to main: open a daemon connection; resolves to an `OpenResult`. */
  daemonOpen: "comma:daemon:open",
  /** Renderer to main: deliver one request frame to a connection. */
  daemonSend: "comma:daemon:send",
  /** Renderer to main: close a connection. */
  daemonClose: "comma:daemon:close",
  /** Main to renderer: one daemon message for a connection. */
  daemonMessage: "comma:daemon:message",
  /** Main to renderer: the daemon closed a connection. */
  daemonClosed: "comma:daemon:closed",
  /** Renderer to main: minimize, maximize/restore or close the window. */
  windowControl: "comma:window:control",
  /** Renderer to main: ask whether the window is maximized. */
  windowIsMaximized: "comma:window:is-maximized",
  /** Main to renderer: the window was maximized or restored. */
  windowMaximized: "comma:window:maximized",
} as const;

/** Result of opening a daemon connection. */
export type OpenResult =
  | { readonly ok: true; readonly id: number }
  | { readonly ok: false; readonly reason: string };

/** A daemon message addressed to one connection. */
export interface DaemonMessageEvent {
  readonly id: number;
  readonly text: string;
}

/** A daemon-initiated close of one connection. */
export interface DaemonClosedEvent {
  readonly id: number;
  readonly code: number;
  readonly reason: string;
}

/** What the window's own controls can ask of it. */
export type WindowCommand = "minimize" | "toggleMaximize" | "close";

/** Largest request frame the main process accepts from the renderer. */
export const MAX_REQUEST_BYTES = 16 * 1024 * 1024;

/** What the preload script exposes to the renderer as `window.commaDesktop`. */
export interface DesktopBridge {
  readonly platform: "darwin" | "win32" | "linux";
  readonly daemon: {
    /** Open a connection to the in-process daemon. */
    open(): Promise<OpenResult>;
    /** Deliver one request frame to a connection. */
    send(id: number, text: string): void;
    /** Close a connection. */
    close(id: number): void;
    /** Listen for daemon messages; returns an unsubscribe function. */
    onMessage(listener: (event: DaemonMessageEvent) => void): () => void;
    /** Listen for daemon-initiated closes; returns an unsubscribe function. */
    onClosed(listener: (event: DaemonClosedEvent) => void): () => void;
  };
  readonly windowControls: {
    /** Minimize, maximize/restore or close the window. */
    run(command: WindowCommand): void;
    /** Whether the window is currently maximized. */
    isMaximized(): Promise<boolean>;
    /** Listen for the window being maximized or restored; returns an unsubscribe function. */
    onMaximizedChange(listener: (maximized: boolean) => void): () => void;
  };
}
