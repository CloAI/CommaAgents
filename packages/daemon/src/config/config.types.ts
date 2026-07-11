import type z from "zod";
import type { LogLevel } from "../logger";
import type { DaemonConfigFileSchema } from "./config.constants";

/** Optional daemon settings accepted by the JSON configuration file. */
export type DaemonConfigFile = z.infer<typeof DaemonConfigFileSchema>;

/** Fully resolved daemon configuration. Every field has a value. */
export interface DaemonConfig {
  /** WebSocket server port. @default 7422 */
  readonly port: number;
  /** WebSocket server bind address. @default "127.0.0.1" */
  readonly host: string;
  /** Minimum log level. @default "info" */
  readonly logLevel: LogLevel;
  /** Optional file that receives structured daemon logs. */
  readonly logFile: string | undefined;
  /** Path to the PID file. */
  readonly pidFile: string;
  /** Path to the config file that was loaded (or the default path if none found). */
  readonly configFile: string;
  /** Directory where run timelines and run configuration are persisted. */
  readonly runsDir: string;
}
