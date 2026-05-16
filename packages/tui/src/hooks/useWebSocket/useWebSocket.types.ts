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
  /** Called with every incoming message (raw string data). */
  readonly onMessage: (data: string) => void;
  /** Called when the connection status changes. */
  readonly onStatus?: (status: WebSocketStatus) => void;
  /** Called on unrecoverable connection errors. */
  readonly onError?: (error: string) => void;
}

/** Return value of the `useWebSocket` hook. */
export interface WebSocketState {
  /** Current connection lifecycle status. */
  readonly status: WebSocketStatus;
  /**
   * Send a string payload over the socket.
   * Returns `true` if the socket was open and the message was sent.
   */
  readonly send: (data: string) => boolean;
  /** Manually close the connection. */
  readonly close: () => void;
}
