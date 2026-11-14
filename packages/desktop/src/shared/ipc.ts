import type {
  WorkspaceCommand,
  WorkspaceSnapshot,
} from "@comma-agents/ui/workspace";

/** Fixed IPC channel names shared by the main process and the preload bridge. */
export const IPC_CHANNELS = {
  /** Renderer to main: choose a local project directory. */
  chooseDirectory: "comma:directory:choose",
  /** Renderer to main: read this window's workspace. */
  workspaceGet: "comma:workspace:get",
  /** Renderer to main: destination has mounted and can accept a transfer. */
  workspaceReady: "comma:workspace:ready",
  /** Renderer to main: request a validated workspace operation. */
  workspaceCommand: "comma:workspace:command",
  /** Main to renderer: committed layout, docking, and close state. */
  workspaceChanged: "comma:workspace:changed",
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
  /** Renderer to main: read the desktop preferences. */
  settingsGet: "comma:settings:get",
  /** Renderer to main: change desktop preferences; resolves to the settings now in effect. */
  settingsSet: "comma:settings:set",
  /** Renderer to main: minimize, maximize/restore or close the window. */
  windowControl: "comma:window:control",
  /** Renderer to main: ask whether the window is maximized. */
  windowIsMaximized: "comma:window:is-maximized",
  /** Main to renderer: the window was maximized or restored. */
  windowMaximized: "comma:window:maximized",
  /** Renderer to main: read this window's pin and opacity settings. */
  windowAppearanceGet: "comma:window:appearance:get",
  /** Renderer to main: change this window's pin or opacity settings. */
  windowAppearanceSet: "comma:window:appearance:set",
} as const;

/** Minimum visible window opacity. */
export const MIN_WINDOW_OPACITY = 0.15;

/** Pin and transparency settings belonging to a single window. */
export interface WindowAppearance {
  /** Whether the window stays above other windows. */
  readonly alwaysOnTop: boolean;
  /** Whole-window opacity from 0.15 to 1. */
  readonly opacity: number;
}

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

/** Preferences owned by the desktop app. */
export interface DesktopSettings {
  readonly keepRunningInBackground: boolean;
  readonly startOnLogin: boolean;
  /** Whether this build can start on login (not on Linux or when unpackaged). */
  readonly startOnLoginAvailable: boolean;
}

/** The preferences a user can change. */
export type DesktopSettingsPatch = Partial<
  Pick<DesktopSettings, "keepRunningInBackground" | "startOnLogin">
>;

/** What the window's own controls can ask of it. */
export type WindowCommand = "minimize" | "toggleMaximize" | "close";

/** Largest request frame the main process accepts from the renderer. */
export const MAX_REQUEST_BYTES = 16 * 1024 * 1024;

/** What the preload script exposes to the renderer as `window.commaDesktop`. */
export interface DesktopBridge {
  /** Choose a local directory; cancelling leaves the selection unchanged. */
  chooseDirectory(initialDirectory?: string): Promise<string | undefined>;
  /** Window-owned chat layout and cross-window transfers. */
  readonly workspace: {
    /** Load the initial snapshot before mounting the UI. */
    get(): Promise<WorkspaceSnapshot>;
    /** Confirm that the renderer mounted. */
    ready(): void;
    /** Request an operation for this window. */
    send(command: WorkspaceCommand): void;
    /** Observe authoritative snapshots; returns an unsubscribe function. */
    onChanged(listener: (snapshot: WorkspaceSnapshot) => void): () => void;
  };
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
  readonly settings: {
    /** Read the desktop preferences. */
    get(): Promise<DesktopSettings>;
    /** Change preferences and return the settings now in effect. */
    set(patch: DesktopSettingsPatch): Promise<DesktopSettings>;
  };
  readonly windowControls: {
    /** Read this window's current pin and opacity settings. */
    getAppearance(): Promise<WindowAppearance>;
    /** Update this window's settings and return the values in effect. */
    setAppearance(patch: Partial<WindowAppearance>): Promise<WindowAppearance>;
    /** Minimize, maximize/restore or close the window. */
    run(command: WindowCommand): void;
    /** Whether the window is currently maximized. */
    isMaximized(): Promise<boolean>;
    /** Listen for the window being maximized or restored; returns an unsubscribe function. */
    onMaximizedChange(listener: (maximized: boolean) => void): () => void;
  };
}
