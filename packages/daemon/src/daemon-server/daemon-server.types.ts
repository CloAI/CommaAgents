import type { Plugin } from "../daemon-plugin";
import type { Connection } from "./connections/connections.types";

/** WebSocket transport configuration for an independently constructed daemon kernel. */
export interface CreateDaemonServerOptions {
  /** Kernel whose plugins expose optional commands and channels. */
  readonly daemon: { readonly plugins: Readonly<Record<string, Plugin>> };
  /** Bind address. @default "127.0.0.1" */
  readonly host?: string;
  /** Listening port; zero chooses an available port. @default 7422 */
  readonly port?: number;
}

/** WebSocket listener whose shutdown does not dispose the daemon. */
export interface DaemonServer {
  /** Start accepting WebSocket clients. */
  start(): Promise<void>;
  /** Disconnect clients and await subscription cleanup, leaving the daemon running. */
  stop(): Promise<void>;
  /** Bound listening port; zero while stopped. */
  readonly port: number;
  /** WebSocket endpoint at /ws. */
  readonly url: string;
}

/** @internal One upgraded socket's routing state. */
export interface PluginSocketData {
  connection?: Connection;
}
