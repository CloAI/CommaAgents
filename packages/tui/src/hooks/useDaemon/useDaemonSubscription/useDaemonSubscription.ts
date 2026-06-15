import { useEffect, useRef } from "react";

import { useDaemon } from "../useDaemon";
import type {
  DaemonMessageListener,
  DaemonMessageType,
} from "../useDaemon.types";

/**
 * React hook that registers a listener for a specific daemon message type.
 *
 * The callback receives the narrowed message variant (not the full union).
 * When `runId` is provided, only messages matching that `runId` are
 * forwarded — messages without a `runId` field are always forwarded.
 *
 * The listener is automatically removed on unmount or when dependencies
 * change. The callback ref is kept stable so consumers don't need to
 * wrap their handler in `useCallback`.
 *
 * @param type    - Daemon message type to listen for (e.g. "agent_streaming").
 * @param callback - Handler invoked per matching message.
 * @param runId   - Optional run ID filter. When set, only messages whose
 *                  `runId` matches are forwarded.
 */
export function useDaemonSubscription<MessageKind extends DaemonMessageType>(
  type: MessageKind,
  callback: DaemonMessageListener<MessageKind>,
  runId?: string | null,
  enabled = true,
): void {
  // Keep the latest callback in a ref so the effect doesn't re-subscribe
  // every time the consumer's closure changes.
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const { on } = useDaemon();

  useEffect(() => {
    if (!enabled) return;

    const handler: DaemonMessageListener<MessageKind> = (message) => {
      // If a runId filter is active, skip messages that don't match.
      // Some daemon messages (pong, error, strategy_list) don't have runId;
      // those are always forwarded.
      if (
        runId != null &&
        "runId" in message &&
        (message as { runId: string }).runId !== runId
      ) {
        return;
      }
      callbackRef.current(message);
    };

    const unsubscribe = on(type, handler);
    return unsubscribe;
  }, [type, runId, on, enabled]);
}
