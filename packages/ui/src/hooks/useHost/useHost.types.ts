/** The part of a browser socket that the daemon connection relies on. */
export interface HostSocket {
  /** Connection phase: 0 connecting, 1 open, anything else unusable. */
  readyState: number;
  /** Called once the connection is usable. */
  onopen: (() => void) | null;
  /** Called with each unparsed daemon message. */
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  /** Called when the connection fails. */
  onerror: (() => void) | null;
  /** Called when the connection ends. */
  onclose:
    | ((event: { readonly code: number; readonly reason: string }) => void)
    | null;
  /** Send one serialized request. */
  send(data: string): void;
  /** End the connection. */
  close(): void;
}

/** What the surrounding application offers beyond a plain web page. */
export interface HostCapabilities {
  /** Open the daemon connection through the host instead of the configured WebSocket URL. */
  readonly createSocket?: () => HostSocket;
}
