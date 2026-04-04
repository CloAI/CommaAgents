import type { DaemonConfig } from "../config";
import type { Logger } from "../logger/logger.types";

/** Per-WebSocket connection data (attached during upgrade). */
export interface WsData {
  readonly clientId: string;
}

/**
 * Options for creating a daemon instance.
 *
 * Model and credential resolution happen via global registries
 * (setGlobalCredentialStore / registerProvider / registerModel).
 * The daemon must configure those at startup before creating the daemon.
 */
export interface CreateDaemonOptions {
  /** Fully resolved daemon configuration. */
  readonly config: DaemonConfig;
  /** Logger for server-level diagnostics. */
  readonly logger: Logger;
  /** Timeout in ms for input/auth bridges. 0 = no timeout. Default: 0. */
  readonly bridgeTimeout?: number;
  /**
   * Override the model for ALL agents in every strategy execution.
   * Format: "providerID/modelID" (e.g., "github-copilot/gpt-4o").
   */
  readonly modelOverride?: string;
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
