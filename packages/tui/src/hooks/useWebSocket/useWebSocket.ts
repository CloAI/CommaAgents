import { useCallback, useEffect, useRef, useState } from "react";

import type { UseWebSocketConfig, WebSocketState, WebSocketStatus } from "./useWebSocket.types";

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

  useEffect(() => {
    updateStatus("connecting");

    const webSocket = new WebSocket(url);
    socketRef.current = webSocket;

    webSocket.addEventListener("open", () => {
      updateStatus("connected");
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

  const send = useCallback((data: string): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(data);
    return true;
  }, []);

  const close = useCallback((): void => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  return { status, send, close };
}
