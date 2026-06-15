import type { RunOverview } from "@comma-agents/daemon";
import { useCallback, useEffect, useState } from "react";

import { useDaemon } from "../../useDaemon/useDaemon";
import { useDaemonCommand } from "../../useDaemon/useDaemonCommand/useDaemonCommand";
import { useDaemonSubscription } from "../../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type { PersistedRunListResult } from "./usePersistedRunList.types";

/** Pair persisted run list requests with daemon run list results. */
export function usePersistedRunList(): PersistedRunListResult {
  const [persistedRuns, setPersistedRuns] = useState<readonly RunOverview[]>(
    [],
  );
  const { status: daemonConnectionStatus } = useDaemon();
  const listRunsCommand = useDaemonCommand("list_runs");

  const fetchPersistedRuns = useCallback(
    (cwd?: string): void => {
      listRunsCommand(cwd !== undefined ? { cwd } : {});
    },
    [listRunsCommand],
  );

  useDaemonSubscription("run_list", (message) => {
    setPersistedRuns(message.runs);
  });

  useEffect(() => {
    if (daemonConnectionStatus === "connected") {
      fetchPersistedRuns(process.cwd());
    }
  }, [daemonConnectionStatus, fetchPersistedRuns]);

  return { persistedRuns, fetchPersistedRuns };
}
