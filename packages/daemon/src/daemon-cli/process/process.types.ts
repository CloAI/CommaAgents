import type { DaemonConfig } from "../../config";

/** Lifecycle state reported by daemon process operations. */
export type DaemonProcessRunState =
  | "running"
  | "stopped"
  | "starting"
  | "error";

/** Options for waiting until the daemon health endpoint is ready. */
export interface DaemonProcessWaitOptions {
  /** Fully resolved daemon config to poll. */
  readonly config: DaemonConfig;
  /** Maximum time to wait for readiness in milliseconds. */
  readonly timeoutMs: number;
}
