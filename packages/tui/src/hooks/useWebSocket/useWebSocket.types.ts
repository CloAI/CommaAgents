/** Lifecycle states of a WebSocket connection. */
export type WebSocketStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/** Configuration for the `useWebSocket` hook. */
export interface UseWebSocketConfig {
  /** WebSocket endpoint URL (e.g. "ws://localhost:7422/ws"). */
  readonly url: string;
  /** Delay before reconnecting after a dropped connection. Default: 2000ms. */
  readonly reconnectDelayMs?: number;
  /** Called with every incoming message (raw string data). */
  readonly onMessage: (data: string) => void;
  /** Called when the connection status changes. */
  readonly onStatus?: (status: WebSocketStatus) => void;
  /** Called when a connection attempt reports an error. */
  readonly onError?: (error: string) => void;
}

/** Return value of the `useWebSocket` hook. */
export interface WebSocketState {
  /** Current connection lifecycle status. */
  readonly status: WebSocketStatus;
  /**
   * Send a string payload over the socket.
   * Returns `true` if the message was sent or queued while connecting.
   */
  readonly send: (data: string) => boolean;
  /** Manually close the connection and stop reconnecting. */
  readonly close: () => void;
}
