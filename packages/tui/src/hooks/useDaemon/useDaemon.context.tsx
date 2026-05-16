import type { DaemonMessage } from "@comma-agents/daemon";
import { parseDaemonMessage } from "@comma-agents/daemon";
import { createContext, useCallback, useMemo, useRef } from "react";

import { useWebSocket } from "../useWebSocket/useWebSocket";
import type {
  DaemonContextProviderProps,
  DaemonContextValue,
  DaemonMessageListener,
  DaemonMessageType,
} from "./useDaemon.types";

export const DaemonContext = createContext<DaemonContextValue | null>(null);

/**
 * Provides a shared WebSocket connection to the daemon.
 *
 * Connects eagerly on mount via `useWebSocket`. Incoming daemon messages
 * are validated against the DaemonMessage Zod union and dispatched to
 * listeners registered via `ctx.on(type, callback)`.
 *
 * @param props - Provider configuration including the daemon WebSocket URL.
 * @example
 * ```tsx
 * <DaemonContextProvider url="ws://localhost:7422/ws">
 *   <App />
 * </DaemonContextProvider>
 * ```
 */
export function DaemonContextProvider({
  url,
  children,
}: DaemonContextProviderProps) {
  // Listener registry: type -> Set of callbacks.
  // Using a ref so we don't trigger re-renders when listeners change.
  const listenersRef = useRef<
    Map<string, Set<DaemonMessageListener<DaemonMessageType>>>
  >(new Map());

  // Stable dispatch — fans out a daemon message to all matching listeners.
  const dispatch = useCallback((message: DaemonMessage) => {
    const set = listenersRef.current.get(message.type);
    if (!set) return;
    for (const listener of set) {
      // biome-ignore lint: The listener is already narrowed by the consumer's generic
      (listener as DaemonMessageListener<typeof message.type>)(
        message as never,
      );
    }
  }, []);

  const handleMessage = useCallback(
    (data: string) => {
      try {
        const raw: unknown = JSON.parse(data);
        const result = parseDaemonMessage(raw);
        if (result.success) {
          dispatch(result.data);
        }
      } catch {
        // Malformed JSON — ignore
      }
    },
    [dispatch],
  );

  const { status, send: sendRaw } = useWebSocket({
    url,
    onMessage: handleMessage,
    onError: (error) => {
      console.error(`[daemon-provider] ${error}`);
    },
  });

  const send = useCallback(
    (message: Record<string, unknown>): boolean => {
      return sendRaw(JSON.stringify(message));
    },
    [sendRaw],
  );

  const on = useCallback(
    <MessageKind extends DaemonMessageType>(
      type: MessageKind,
      listener: DaemonMessageListener<MessageKind>,
    ): (() => void) => {
      const map = listenersRef.current;
      if (!map.has(type)) {
        map.set(type, new Set());
      }
      const set = map.get(type)!;
      set.add(listener as unknown as DaemonMessageListener<DaemonMessageType>);
      return () => {
        set.delete(
          listener as unknown as DaemonMessageListener<DaemonMessageType>,
        );
      };
    },
    [],
  );

  const off = useCallback(
    <MessageKind extends DaemonMessageType>(
      type: MessageKind,
      listener: DaemonMessageListener<MessageKind>,
    ): void => {
      const set = listenersRef.current.get(type);
      if (set) {
        set.delete(
          listener as unknown as DaemonMessageListener<DaemonMessageType>,
        );
      }
    },
    [],
  );

  // Stable context value — only changes when status changes.
  const value = useMemo<DaemonContextValue>(
    () => ({ status, send, on, off }),
    [status, send, on, off],
  );

  return (
    <DaemonContext.Provider value={value}>{children}</DaemonContext.Provider>
  );
}
