import { useCallback, useSyncExternalStore } from "react";

import { logStore } from "./logStore";
import type { LogEntry, LogsState, LogStoreListener } from "./useLogs.types";

// Stable references for useSyncExternalStore — passing methods directly off
// `logStore` would create new bound functions on every render only if we used
// `.bind()`, but keeping them as module-level constants guarantees referential
// stability and avoids any surprise from re-subscriptions.
function subscribe(listener: LogStoreListener): () => void {
  return logStore.subscribe(listener);
}

function getSnapshot(): readonly LogEntry[] {
  return logStore.getSnapshot();
}

/**
 * Subscribe to the global log store that captures console output.
 *
 * The store is shared across the whole app and is created once at module
 * load time. Every component that calls this hook re-renders whenever a new
 * log entry is appended.
 *
 * @example
 * ```tsx
 * const { logs, clearLogs } = useLogs();
 * return <Text>{logs.length} entries</Text>;
 * ```
 */
export function useLogs(): LogsState {
  const logs = useSyncExternalStore(subscribe, getSnapshot);

  const clearLogs = useCallback(() => {
    logStore.clear();
  }, []);

  return { logs, clearLogs };
}
