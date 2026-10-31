import { useSyncExternalStore } from "react";
import type { LogBucket, LogEntry } from "./logger";

/**
 * Subscribe to one bucket's retained history without rerendering other consumers.
 * @param {LogBucket} bucket - History to observe.
 * @returns {readonly LogEntry[]} The current immutable snapshot.
 */
export function useLogBucket(bucket: LogBucket): readonly LogEntry[] {
  return useSyncExternalStore(
    bucket.subscribe,
    bucket.getSnapshot,
    bucket.getSnapshot,
  );
}
