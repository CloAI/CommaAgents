import type { DaemonConfig } from "../config";

/** @internal Per-WebSocket connection data attached during upgrade. */
export interface WsData {
  readonly clientId: string;
}

/**
 * Options for creating a daemon instance.
 *
 * Use a fully resolved daemon configuration. The owning application configures
 * LogTape once for all daemon instances.
 */
export interface CreateDaemonOptions {
  /** Fully resolved daemon configuration. */
  readonly config: DaemonConfig;
}

/** The daemon instance — start/stop the server. */
export interface Daemon {
  /** Start listening for connections. */
  start(): Promise<void>;
  /** Gracefully shut down the server and all connections. */
  stop(): Promise<void>;
  /** The port the server is listening on (available after start). */
  readonly port: number;
  /** The full WebSocket URL (e.g. `ws://127.0.0.1:7422/ws`). */
  readonly url: string;
}
