import { useCallback, useEffect, useRef, useState } from "react";

import type {
  UseWebSocketConfig,
  WebSocketState,
  WebSocketStatus,
} from "./useWebSocket.types";

const DEFAULT_RECONNECT_DELAY_MS = 2_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

/**
 * Generic WebSocket connection hook.
 *
 * Connects eagerly on mount, reconnects after dropped connections, and
 * disconnects on unmount. Reconnects immediately when the `url` changes.
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
  const {
    url,
    reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
    connectionTimeoutMs = DEFAULT_CONNECTION_TIMEOUT_MS,
    onMessage,
    onStatus,
    onError,
  } = config;
  const [status, setStatus] = useState<WebSocketStatus>("disconnected");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const manuallyClosedRef = useRef(false);
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
      console.info(
        `[websocket] Queued outbound message (${data.length} bytes) while connecting`,
      );
      return true;
    }
    if (socket.readyState !== WebSocket.OPEN) {
      console.error(
        `[websocket] Failed to send outbound message (${data.length} bytes); socket is not open`,
      );
      return false;
    }
    try {
      socket.send(data);
      console.debug(`[websocket] Sent outbound message (${data.length} bytes)`);
      return true;
    } catch (error) {
      console.error(
        `[websocket] Failed to send outbound message (${data.length} bytes): ${error instanceof Error ? error.message : String(error)}`,
      );
      onErrorRef.current?.("WebSocket send failed");
      return false;
    }
  }, []);

  const close = useCallback((): void => {
    manuallyClosedRef.current = true;
    pendingMessagesRef.current = [];
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    socketRef.current?.close();
    socketRef.current = null;
    updateStatus("disconnected");
  }, [updateStatus]);

  useEffect(() => {
    let disposed = false;
    manuallyClosedRef.current = false;

    const connect = (): void => {
      if (disposed || manuallyClosedRef.current) return;

      updateStatus("connecting");
      console.log(`[websocket] Connecting to ${url}`);

      let webSocket: WebSocket;
      try {
        webSocket = new WebSocket(url);
      } catch (error) {
        const message = `WebSocket connection failed: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[websocket] ${message}: ${url}`);
        updateStatus("error");
        onErrorRef.current?.(message);
        console.log(
          `[websocket] Retrying ${url} in ${reconnectDelayMs}ms after connection failure`,
        );
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, reconnectDelayMs);
        return;
      }
      socketRef.current = webSocket;
      connectionTimeoutRef.current = setTimeout(() => {
        if (
          disposed ||
          socketRef.current !== webSocket ||
          webSocket.readyState === WebSocket.OPEN
        ) {
          return;
        }
        connectionTimeoutRef.current = null;
        const message = `WebSocket connection timed out after ${connectionTimeoutMs}ms`;
        console.error(`[websocket] ${message}: ${url}`);
        updateStatus("error");
        onErrorRef.current?.(message);
        webSocket.close();
      }, connectionTimeoutMs);

      webSocket.addEventListener("open", () => {
        if (disposed || socketRef.current !== webSocket) return;

        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }

        updateStatus("connected");
        console.log(`[websocket] Connected to ${url}`);

        // Flush messages queued while connecting or waiting to reconnect.
        const queued = pendingMessagesRef.current;
        pendingMessagesRef.current = [];
        for (const queuedMessage of queued) {
          try {
            webSocket.send(queuedMessage);
            console.debug(
              `[websocket] Sent queued outbound message (${queuedMessage.length} bytes)`,
            );
          } catch (error) {
            // Preserve messages that fail during the flush so they can be
            // retried after reconnecting.
            pendingMessagesRef.current.push(queuedMessage);
            console.error(
              `[websocket] Failed to flush queued outbound message (${queuedMessage.length} bytes): ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      });

      webSocket.addEventListener("message", (event) => {
        if (disposed || socketRef.current !== webSocket) return;
        const data = String(event.data);
        console.debug(
          `[websocket] Received inbound message (${data.length} bytes)`,
        );
        onMessageRef.current(data);
      });

      webSocket.addEventListener("close", () => {
        if (disposed || socketRef.current !== webSocket) return;

        socketRef.current = null;
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        updateStatus("disconnected");
        if (manuallyClosedRef.current) return;

        console.log(
          `[websocket] Disconnected from ${url}; reconnecting in ${reconnectDelayMs}ms`,
        );
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, reconnectDelayMs);
      });

      webSocket.addEventListener("error", () => {
        if (disposed || socketRef.current !== webSocket) return;
        console.error(`[websocket] Connection error: ${url}`);
        updateStatus("error");
        onErrorRef.current?.("WebSocket connection failed");
      });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [url, reconnectDelayMs, connectionTimeoutMs, updateStatus]);

  return { status, send, close };
}
