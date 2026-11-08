import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useHost } from "../useHost";
import type { HostSocket } from "../useHost";
import {
  CONNECTION_TIMEOUT_MS,
  INITIAL_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
} from "./useWebSocket.constants";
import type { WebSocketOptions, WebSocketState } from "./useWebSocket.types";

/**
 * Maintain a browser socket with capped exponential reconnection and no outgoing queue.
 * @param {WebSocketOptions} options - Endpoint and callbacks for the active connection.
 * @returns {WebSocketState} Connection state and a stable immediate-send callback.
 * @example
 * const { send, status } = useWebSocket({ url, onMessage: handleMessage });
 */
export function useWebSocket({
  url,
  onMessage,
  onStatus,
}: WebSocketOptions): WebSocketState {
  const [state, setState] = useState<Pick<WebSocketState, "status" | "error">>({
    status: "connecting",
    error: undefined,
  });
  const callbacks = useRef({ onMessage, onStatus });
  const { createSocket } = useHost();
  const activeConnection = useRef<{
    socket: WebSocket | HostSocket;
    fail: (error: Error) => void;
  } | null>(null);

  const send = useCallback((data: string): boolean => {
    const connection = activeConnection.current;
    if (!connection || connection.socket.readyState === 0) {
      return false;
    }
    if (connection.socket.readyState !== 1) {
      connection.fail(new Error("WebSocket is not open."));
      return false;
    }
    try {
      connection.socket.send(data);
      return true;
    } catch (error) {
      connection.fail(
        error instanceof Error ? error : new Error("WebSocket send failed."),
      );
      return false;
    }
  }, []);

  useLayoutEffect(() => {
    callbacks.current = { onMessage, onStatus };
  }, [onMessage, onStatus]);

  useEffect(() => {
    let disposed = false;
    let retryDelay = INITIAL_RECONNECT_DELAY_MS;
    // Opening and retrying never overlap, so they share one owned timer.
    let timer: ReturnType<typeof setTimeout>;
    let disposeAttempt: () => void;

    const transition = (
      status: WebSocketState["status"],
      error?: Error,
    ): void => {
      setState({ status, error });
      callbacks.current.onStatus?.(status, error);
    };

    const connect = (): void => {
      if (disposed) {
        return;
      }
      let socket: WebSocket | HostSocket | undefined;
      let attemptFinished = false;

      const cleanup = (): void => {
        attemptFinished = true;
        clearTimeout(timer);
        activeConnection.current = null;
        if (!socket) {
          return;
        }
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      };
      disposeAttempt = cleanup;

      const fail = (error: Error): void => {
        if (attemptFinished) {
          return;
        }
        cleanup();
        const nextDelay = retryDelay;
        retryDelay = Math.min(retryDelay * 2, MAX_RECONNECT_DELAY_MS);
        timer = setTimeout(connect, nextDelay);
        transition("reconnecting", error);
      };

      timer = setTimeout(
        () => fail(new Error("WebSocket connection timed out.")),
        CONNECTION_TIMEOUT_MS,
      );
      try {
        socket = createSocket?.() ?? new WebSocket(url);
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new Error("WebSocket connection failed."),
        );
        return;
      }
      activeConnection.current = { socket, fail };
      socket.onopen = () => {
        if (attemptFinished) {
          return;
        }
        clearTimeout(timer);
        retryDelay = INITIAL_RECONNECT_DELAY_MS;
        transition("connected");
      };
      socket.onmessage = (event: { readonly data: unknown }) => {
        if (!attemptFinished) {
          callbacks.current.onMessage(event.data);
        }
      };
      socket.onerror = () => fail(new Error("WebSocket connection failed."));
      socket.onclose = (event: {
        readonly code: number;
        readonly reason: string;
      }) =>
        fail(new Error(event.reason || `WebSocket closed (${event.code}).`));
    };

    transition("connecting");
    connect();
    return () => {
      disposed = true;
      disposeAttempt();
    };
  }, [url, createSocket]);

  return { ...state, send };
}
