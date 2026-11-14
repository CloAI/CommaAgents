import { createLogBucket } from "./logger";

/** Daemon diagnostics retained for this browser tab until cleared or reloaded. */
export const daemonLogs = createLogBucket({ name: "daemon" });
