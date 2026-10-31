/** Current lifecycle phase of the shared browser connection. */
export type WebSocketStatus = "connecting" | "connected" | "reconnecting";

/** Options for a persistent browser WebSocket connection. */
export interface WebSocketOptions {
  /** Endpoint to connect to; changing it replaces the connection. */
  readonly url: string;
  /** Receives unparsed message data from the active connection. */
  readonly onMessage: (data: unknown) => void;
  /** Receives lifecycle transitions, including connection failures. */
  readonly onStatus?: (status: WebSocketStatus, error?: Error) => void;
}

/** Connection state and an unqueued send operation. */
export interface WebSocketState {
  /** Current connection phase. */
  readonly status: WebSocketStatus;
  /** Most recent connection failure, cleared on successful connection. */
  readonly error: Error | undefined;
  /** Send immediately when connected; return false when unavailable or failed. */
  readonly send: (data: string) => boolean;
}
