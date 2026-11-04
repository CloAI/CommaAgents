import { useContext } from "react";
import { DaemonConnectionStatusContext } from "./useCommaAgentsDaemon.context";
import type { WebSocketStatus } from "../useWebSocket";

/**
 * Observe the shared socket without registering a request or subscription.
 * @returns {WebSocketStatus} Current daemon connection status.
 * @example
 * const status = useDaemonConnectionStatus();
 */
export function useDaemonConnectionStatus(): WebSocketStatus {
  const status = useContext(DaemonConnectionStatusContext);
  if (status === null) {
    throw new Error(
      "useDaemonConnectionStatus must be used within CommaAgentsDaemonProvider.",
    );
  }
  return status;
}
