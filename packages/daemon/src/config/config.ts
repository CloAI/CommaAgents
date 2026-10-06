import {
  getDaemonConfigFile,
  getDaemonConfig,
  setDaemonConfigFile,
  setDaemonHost,
  setDaemonLogFile,
  setDaemonLogLevel,
  setDaemonPidFile,
  setDaemonPort,
  setDaemonRunsDirectory,
} from "../defaults";
import type { DaemonConfig } from "./config.types";
import { readConfigFile } from "./config.utils";

/** Options for selecting daemon configuration inputs. */
export interface LoadConfigOptions {
  /** Override the config file path. */
  readonly configFile?: string;
  /** Environment values used to resolve overrides. @default process.env */
  readonly env?: Record<string, string | undefined>;
}

/**
 * Load daemon configuration with layered resolution.
 *
 * Priority (highest first):
 * 1. Environment variables
 * 2. JSON config file
 * 3. Built-in defaults
 *
 * @param {LoadConfigOptions} [options] - Optional file and environment overrides.
 * @returns {DaemonConfig} The fully resolved and validated daemon configuration.
 * @throws If the config file exists but contains invalid JSON or fails schema validation.
 */
export function loadDaemonConfig(options?: LoadConfigOptions): DaemonConfig {
  // Load the config file
  const configFile =
    options?.configFile ??
    options?.env?.COMMA_DAEMON_CONFIG_FILE ??
    getDaemonConfigFile();
  setDaemonConfigFile(configFile);

  // Handle all the file overrides if present, and globally update the values.
  const fileOverrides = readConfigFile(configFile);
  if (fileOverrides.port !== undefined) setDaemonPort(fileOverrides.port);
  if (fileOverrides.host !== undefined) setDaemonHost(fileOverrides.host);
  if (fileOverrides.logLevel !== undefined)
    setDaemonLogLevel(fileOverrides.logLevel);
  if (fileOverrides.logFile !== undefined)
    setDaemonLogFile(fileOverrides.logFile);
  if (fileOverrides.pidFile !== undefined)
    setDaemonPidFile(fileOverrides.pidFile);
  if (fileOverrides.runsDir !== undefined)
    setDaemonRunsDirectory(fileOverrides.runsDir);

  // If env variables were defined override the defaults and files, as env take priority.
  const env = options?.env;
  if (env) {
    if (env.COMMA_DAEMON_PORT)
      setDaemonPort(Number.parseInt(env.COMMA_DAEMON_PORT, 10));
    if (env.COMMA_DAEMON_HOST) setDaemonHost(env.COMMA_DAEMON_HOST);
    if (env.COMMA_DAEMON_LOG_LEVEL)
      setDaemonLogLevel(env.COMMA_DAEMON_LOG_LEVEL as DaemonConfig["logLevel"]);
    if (env.COMMA_DAEMON_LOG_FILE) setDaemonLogFile(env.COMMA_DAEMON_LOG_FILE);
    if (env.COMMA_DAEMON_PID_FILE) setDaemonPidFile(env.COMMA_DAEMON_PID_FILE);
    if (env.COMMA_DAEMON_RUNS_DIR)
      setDaemonRunsDirectory(env.COMMA_DAEMON_RUNS_DIR);
  }

  const config = getDaemonConfig();

  // Validate the final port is in range
  if (
    config.port < 1 ||
    config.port > 65535 ||
    !Number.isInteger(config.port)
  ) {
    throw new Error(
      `Invalid port: ${config.port}. Must be an integer between 1 and 65535.`,
    );
  }

  // Validate logLevel
  const validLevels = [
    "trace",
    "debug",
    "info",
    "warn",
    "warning",
    "error",
    "fatal",
  ];
  if (!validLevels.includes(config.logLevel)) {
    throw new Error(
      `Invalid logLevel: "${config.logLevel}". Must be one of: ${validLevels.join(", ")}.`,
    );
  }

  return config;
}
