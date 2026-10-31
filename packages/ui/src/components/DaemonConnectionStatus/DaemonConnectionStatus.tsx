import { useCallback, useState } from "react";
import { ConnectionStatus } from "../../design-system/ConnectionStatus";
import { useDaemonConnectionStatus } from "../../hooks/useCommaAgentsDaemon";
import { daemonLogs } from "../../hooks/useLogBucket/logger";
import { LogDialog } from "../LogDialog";

/**
 * Display the state of the application's existing shared daemon socket.
 * @returns {React.ReactElement} The daemon connection indicator.
 */
export function DaemonConnectionStatus() {
  const [logsOpen, setLogsOpen] = useState(false);
  const openLogs = useCallback(() => setLogsOpen(true), []);
  const closeLogs = useCallback(() => setLogsOpen(false), []);
  const status = useDaemonConnectionStatus();
  return (
    <>
      <ConnectionStatus
        label="Daemon"
        onClick={openLogs}
        status={status === "connected" ? "connected" : "disconnected"}
      />
      {logsOpen && (
        <LogDialog
          bucket={daemonLogs}
          title="Daemon logs"
          onClose={closeLogs}
        />
      )}
    </>
  );
}
