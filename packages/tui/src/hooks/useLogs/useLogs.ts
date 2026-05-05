import { useCallback, useSyncExternalStore } from "react";

import { logStore } from "./logStore";
import type { LogsState } from "./useLogs.types";

/**
 * Subscribe to the global log store that hijacks all console output.
 *
 * Console methods are redirected at module load time so nothing reaches
 * the terminal. All output flows exclusively to the Logs tab.
 */
export function useLogs(): LogsState {
  const logs = useSyncExternalStore(logStore.subscribe, logStore.getSnapshot);

  const clearLogs = useCallback(() => {
    logStore.clear();
  }, []);

  return { logs, clearLogs };
}
