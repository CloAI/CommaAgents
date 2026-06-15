import type z from "zod";
import type { LogLevel } from "../logger";
import type { DaemonConfigFileSchema } from "./config.constants";

export type DaemonConfigFile = z.infer<typeof DaemonConfigFileSchema>;

/** Fully resolved daemon configuration. Every field has a value. */
export interface DaemonConfig {
  /** WebSocket server port. Default: 7422. Env: COMMA_DAEMON_PORT. */
  readonly port: number;
  /** WebSocket server bind address. Default: "127.0.0.1". Env: COMMA_DAEMON_HOST. */
  readonly host: string;
  /** Minimum log level. Default: "info". Env: COMMA_DAEMON_LOG_LEVEL. */
  readonly logLevel: LogLevel;
  /** Optional log file path. Env: COMMA_DAEMON_LOG_FILE. */
  readonly logFile: string | undefined;
  /** Directory for dynamically installed provider packages. Env: COMMA_DAEMON_PROVIDER_CACHE_DIR. */
  readonly providerCacheDir: string;
  /** Path to the PID file. Env: COMMA_DAEMON_PID_FILE. */
  readonly pidFile: string;
  /** Path to the config file that was loaded (or the default path if none found). */
  readonly configFile: string;
  /** Directory where run files are persisted. Env: COMMA_DAEMON_RUNS_DIR. */
  readonly runsDir: string;
}
