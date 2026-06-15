import z from "zod";
import type { DaemonConfig } from "./config.types";

const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

/**
 * Zod schema for the daemon config file.
 * All fields are optional — missing fields use defaults.
 */
export const DaemonConfigFileSchema = z
  .object({
    port: z.number().int().min(1).max(65535).optional(),
    host: z.string().optional(),
    logLevel: LogLevelSchema.optional(),
    logFile: z.string().optional(),
    providerCacheDir: z.string().optional(),
    pidFile: z.string().optional(),
    configFile: z.string().optional(),
    runsDir: z.string().optional(),
  })
  .strict();


/** Map of env var names → config keys + parsers. */
export const ENV_MAP: Array<{
  env: string;
  key: keyof DaemonConfig;
  parse: (val: string) => unknown;
}> = [
  {
    env: "COMMA_DAEMON_PORT",
    key: "port",
    parse: (rawValue) => parseInt(rawValue, 10),
  },
  { env: "COMMA_DAEMON_HOST", key: "host", parse: (rawValue) => rawValue },
  {
    env: "COMMA_DAEMON_LOG_LEVEL",
    key: "logLevel",
    parse: (rawValue) => rawValue,
  },
  {
    env: "COMMA_DAEMON_LOG_FILE",
    key: "logFile",
    parse: (rawValue) => rawValue,
  },
  {
    env: "COMMA_DAEMON_PROVIDER_CACHE_DIR",
    key: "providerCacheDir",
    parse: (rawValue) => rawValue,
  },
  {
    env: "COMMA_DAEMON_PID_FILE",
    key: "pidFile",
    parse: (rawValue) => rawValue,
  },
  {
    env: "COMMA_DAEMON_RUNS_DIR",
    key: "runsDir",
    parse: (rawValue) => rawValue,
  },
];
