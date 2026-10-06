import type { RunStatus } from "./run-store.types";

export const ALLOWED_RUN_STATUS_TRANSITIONS: Readonly<
  Record<RunStatus, ReadonlySet<RunStatus>>
> = {
  pending: new Set(["running", "cancelled", "error"]),
  running: new Set(["completed", "error", "cancelled"]),
  completed: new Set(),
  error: new Set(),
  cancelled: new Set(),
};
