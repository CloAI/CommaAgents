import type { RunLifecycleStatus } from "./run-store.types";

export const ALLOWED_RUN_STATUS_TRANSITIONS: Readonly<
  Record<RunLifecycleStatus, ReadonlySet<RunLifecycleStatus>>
> = {
  pending: new Set(["running", "cancelled", "error"]),
  running: new Set(["completed", "error", "cancelled"]),
  completed: new Set(),
  error: new Set(),
  cancelled: new Set(),
};
