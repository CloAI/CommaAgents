/** Lifecycle state reported by daemon process operations. */
export type DaemonProcessRunState =
  | "running"
  | "stopped"
  | "starting"
  | "error";
