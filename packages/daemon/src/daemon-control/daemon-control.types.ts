import type { DaemonConfig } from "../config";

export type DaemonRunState = "running" | "stopped" | "starting" | "error";

export interface DaemonStatus {
  /** Current daemon lifecycle state. */
  readonly state: DaemonRunState;
  /** Whether the PID file points at a live process. */
  readonly running: boolean;
  /** Live daemon process ID, when known. */
  readonly pid: number | undefined;
  /** Configured daemon host. */
  readonly host: string;
  /** Configured daemon port. */
  readonly port: number;
  /** Path to the resolved daemon config file. */
  readonly configFile: string;
  /** Path to the daemon PID file. */
  readonly pidFile: string;
  /** Path to the daemon log file, when configured. */
  readonly logFile: string | undefined;
  /** Installed daemon package version. */
  readonly version: string;
  /** Last startup error visible to the control layer, when known. */
  readonly lastStartupError: string | undefined;
}

export interface DaemonStartOptions {
  /** Run daemon in the current process instead of detaching. @default false */
  readonly foreground?: boolean;
  /** Override the daemon listening port. */
  readonly port?: number;
  /** Override model for all agents as provider/model. */
  readonly modelOverride?: string;
  /** Enable debug-level daemon logging. @default false */
  readonly verbose?: boolean;
  /** Treat an already-running daemon as success. @default false */
  readonly allowExisting?: boolean;
  /** Bun-runnable daemon CLI entrypoint used for detached startup. */
  readonly foregroundEntrypoint?: string;
  /** Command prefix used to invoke the daemon CLI before start flags. */
  readonly foregroundCommand?: ReadonlyArray<string>;
  /** Maximum time to wait for readiness in milliseconds. @default 3000 */
  readonly readinessTimeoutMs?: number;
  /** Environment used while resolving daemon config. @default process.env */
  readonly env?: Record<string, string | undefined>;
}

export interface DaemonStartResult {
  /** Status after the start attempt. */
  readonly status: DaemonStatus;
  /** Whether this call started a new process. */
  readonly started: boolean;
  /** Whether startup used foreground mode. */
  readonly foreground: boolean;
  /** User-facing summary of the result. */
  readonly message: string;
}

export interface DaemonStopResult {
  /** Status after the stop attempt. */
  readonly status: DaemonStatus;
  /** Whether this call stopped a live daemon process. */
  readonly stopped: boolean;
  /** User-facing summary of the result. */
  readonly message: string;
}

export interface DaemonWaitOptions {
  /** Fully resolved daemon config to poll. */
  readonly config: DaemonConfig;
  /** Maximum time to wait for readiness in milliseconds. */
  readonly timeoutMs: number;
}
