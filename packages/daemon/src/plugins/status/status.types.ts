import type { NotifyingPlugin } from "../../daemon-plugin";

/** Daemon lifecycle state, independent of attached servers. */
export interface DaemonStatus {
  /** Current daemon lifecycle phase, controlled by the kernel. */
  readonly phase: "starting" | "running" | "stopping" | "stopped";
  /** Installed daemon package version. */
  readonly version: string;
  /** ISO timestamp at which kernel construction began. */
  readonly startedAt: string;
}
/** Notifications emitted when the daemon lifecycle changes. */
export interface StatusNotifications {
  readonly status_updated: {
    readonly type: "status_updated";
    readonly status: DaemonStatus;
  };
}
/** Read-only daemon status and lifecycle observation. */
export interface StatusPlugin extends NotifyingPlugin<
  "status",
  StatusNotifications
> {
  /** Read current lifecycle status without attaching a server. */
  getStatus(): DaemonStatus;
}
/** @internal Public plugin and lifecycle controls retained by the daemon. */
export interface CreatedStatusPlugin {
  readonly plugin: StatusPlugin;
  readonly setPhase: (phase: DaemonStatus["phase"]) => void;
}
/** @internal State changed only by the daemon's lifecycle controller. */
export interface StatusContext {
  snapshot: DaemonStatus;
}
