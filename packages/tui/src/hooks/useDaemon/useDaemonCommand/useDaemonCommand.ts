import { useCallback } from "react";

import { useDaemonContext } from "../useDaemon";
import type { DaemonCommandMap, DaemonCommandType } from "./useDaemonCommand.types";

/**
 * React hook that returns a function to send a specific command type
 * to the daemon over the shared WebSocket.
 *
 * The returned function auto-injects the `type` discriminant and a
 * fresh `requestId` (UUID). It returns the `requestId` so the caller
 * can correlate responses if needed.
 *
 * Returns `null` instead of a `requestId` when the send fails
 * (e.g. WebSocket not connected).
 *
 * @param type - The daemon command type to send.
 * @example
 * ```tsx
 * const startStrategy = useDaemonCommand("start_strategy");
 * const reqId = startStrategy({ strategyPath: "/path/plan.json" });
 * ```
 */
export function useDaemonCommand<CommandKind extends DaemonCommandType>(
  type: CommandKind,
): (payload: DaemonCommandMap[CommandKind]) => string | null {
  const { send } = useDaemonContext();

  return useCallback(
    (payload: DaemonCommandMap[CommandKind]): string | null => {
      const requestId = crypto.randomUUID();
      const message = { ...payload, type, requestId };
      const ok = send(message as Record<string, unknown>);
      return ok ? requestId : null;
    },
    [type, send],
  );
}
