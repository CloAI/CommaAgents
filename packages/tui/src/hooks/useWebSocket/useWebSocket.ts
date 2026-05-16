import { useCallback, useEffect, useRef, useState } from "react";

import type {
  UseWebSocketConfig,
  WebSocketState,
  WebSocketStatus,
} from "./useWebSocket.types";

/**
 * Generic WebSocket connection hook.
 *
 * Connects eagerly on mount and disconnects on unmount. Reconnects
 * automatically when the `url` changes.
 *
 * @param config - Connection configuration including URL and event callbacks.
 * @example
 * ```tsx
 * const { status, send } = useWebSocket({
 *   url: "ws://localhost:7422/ws",
 *   onMessage: (data) => console.log("received", data),
 * });
 * ```
 */
export function useWebSocket(config: UseWebSocketConfig): WebSocketState {
  const { url, onMessage, onStatus, onError } = config;
  const [status, setStatus] = useState<WebSocketStatus>("disconnected");
  const socketRef = useRef<WebSocket | null>(null);
  /**
   * Outbound messages submitted before the WebSocket reaches OPEN.
   * Flushed in order on the `open` event so user actions performed during
   * the brief connecting window are not silently dropped.
   */
  const pendingMessagesRef = useRef<string[]>([]);

  // Keep callbacks in refs so the effect doesn't re-run when closures change.
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Notify both internal state and external callback.
  const updateStatus = useCallback((nextStatus: WebSocketStatus) => {
    setStatus(nextStatus);
    onStatusRef.current?.(nextStatus);
  }, []);

  const send = useCallback((data: string): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState === WebSocket.CONNECTING) {
      pendingMessagesRef.current.push(data);
      return true;
    }
    if (socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(data);
    return true;
  }, []);

  const close = useCallback((): void => {
    pendingMessagesRef.current = [];
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  useEffect(() => {
    updateStatus("connecting");

    const webSocket = new WebSocket(url);
    socketRef.current = webSocket;

    webSocket.addEventListener("open", () => {
      updateStatus("connected");
      // Flush any messages queued while the socket was still connecting.
      const queued = pendingMessagesRef.current;
      pendingMessagesRef.current = [];
      for (const queuedMessage of queued) {
        try {
          webSocket.send(queuedMessage);
        } catch {
          // If sending fails (socket closed between open and flush), drop
          // the message silently — caller already considered it sent.
        }
      }
    });

    webSocket.addEventListener("message", (event) => {
      onMessageRef.current(String(event.data));
    });

    webSocket.addEventListener("close", () => {
      updateStatus("disconnected");
    });

    webSocket.addEventListener("error", () => {
      updateStatus("error");
      onErrorRef.current?.("WebSocket connection failed");
    });

    return () => {
      webSocket.close();
      socketRef.current = null;
    };
  }, [url, updateStatus]);

  return { status, send, close };
}
