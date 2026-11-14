import type { LayoutAction } from "../useLayout/useLayout.reducer";
import type {
  ClientWorkspaceStore,
  LayoutState,
} from "../useLayout/useLayout.types";
import type { DropZone } from "../useLayout/layout.types";

/** The part of a browser socket that the daemon connection relies on. */
export interface HostSocket {
  /** Connection phase: 0 connecting, 1 open, anything else unusable. */
  readyState: number;
  /** Called once the connection is usable. */
  onopen: (() => void) | null;
  /** Called with each unparsed daemon message. */
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  /** Called when the connection fails. */
  onerror: (() => void) | null;
  /** Called when the connection ends. */
  onclose:
    | ((event: { readonly code: number; readonly reason: string }) => void)
    | null;
  /** Send one serialized request. */
  send(data: string): void;
  /** End the connection. */
  close(): void;
}

/** Settings owned by a desktop host rather than the browser's local storage. */
export interface DesktopSettings {
  /** Closing the window hides it and keeps the daemon and its runs going. */
  readonly keepRunningInBackground: boolean;
  /** Start hidden when the user signs in. */
  readonly startOnLogin: boolean;
  /** Whether this host can start on login (not on Linux or in development builds). */
  readonly startOnLoginAvailable: boolean;
}

/** The values a user can change in {@link DesktopSettings}. */
export type DesktopSettingsPatch = Partial<
  Pick<DesktopSettings, "keepRunningInBackground" | "startOnLogin">
>;

/** Read and change {@link DesktopSettings}; each change takes effect at once. */
export interface HostDesktopSettings {
  /** Read the current settings. */
  get(): Promise<DesktopSettings>;
  /** Apply a change and return the settings now in effect. */
  set(patch: DesktopSettingsPatch): Promise<DesktopSettings>;
}

/** What the surrounding application offers beyond a plain web page. */
export interface HostCapabilities {
  /** Choose a native directory when the host supports a directory picker. */
  readonly chooseDirectory?: (
    initialDirectory?: string,
  ) => Promise<string | undefined>;
  /** Shared desktop window ownership and layout. */
  readonly workspace?: HostWorkspace;
  /** Open the daemon connection through the host instead of the configured WebSocket URL. */
  readonly createSocket?: () => HostSocket;
  /** Desktop-only preferences, shown in General settings when present. */
  readonly desktopSettings?: HostDesktopSettings;
}

/** Window-owned layout and app-wide docking interaction. */
export interface WorkspaceSnapshot {
  /** This window's panes and selected strategies. */
  readonly state: LayoutState;
  readonly clientWorkspaces?: ClientWorkspaceStore;
  readonly projectId?: string;
  /** Any native window is still preparing or submitting a chat. */
  readonly submissionPending?: boolean;
  /** Only the main window has the navigation sidebar. */
  readonly detached: boolean;
  /** A returned chat is awaiting a destination click in the main window. */
  readonly selectingDock: boolean;
  /** Failure stopping this window's run; closing can be retried. */
  readonly closeError?: string;
  /** Run cancellation is in progress before closing a pane or window. */
  readonly closing?: boolean;
}

/** Desktop workspace operations; window identity comes from the IPC sender. */
export type WorkspaceCommand =
  | {
      readonly type: "newChatInPane";
      readonly projectId: string;
      readonly paneId: string;
      readonly runId: string;
    }
  | {
      readonly type: "revealChat";
      readonly runId: string;
      readonly paneId: string;
      readonly projectId: string;
    }
  | {
      readonly type: "switchProject";
      readonly projectId: string;
      readonly state: LayoutState;
    }
  | {
      readonly type: "saveClientWorkspaces";
      readonly value: ClientWorkspaceStore;
    }
  | {
      readonly type: "busy";
      readonly paneId: string;
      readonly pending: boolean;
    }
  | { readonly type: "layout"; readonly action: LayoutAction }
  | {
      readonly type: "detach";
      readonly paneId: string;
      readonly x?: number;
      readonly y?: number;
    }
  | { readonly type: "return" }
  | { readonly type: "close" }
  | {
      readonly type: "dock";
      readonly targetId: string;
      readonly zone: DropZone;
    }
  | { readonly type: "cancelDock" }
  | { readonly type: "drag"; readonly paneId?: string }
  | {
      readonly type: "endDrag";
      readonly paneId: string;
      readonly x: number;
      readonly y: number;
      readonly cancelled: boolean;
    };

/** Desktop-controlled workspace store, hydrated before the renderer mounts. */
export interface HostWorkspace {
  /** Confirm that the destination renderer has mounted successfully. */
  ready(): void;
  /** Read the latest stable snapshot. */
  getSnapshot(): WorkspaceSnapshot;
  /** Listen for committed workspace updates. */
  subscribe(listener: () => void): () => void;
  /** Request an operation on this window's workspace. */
  send(command: WorkspaceCommand): void;
}
