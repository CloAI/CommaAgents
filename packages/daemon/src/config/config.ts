import type { DaemonConfig } from "./config.types";
import {
  buildDefaults,
  readConfigFile,
  readEnvOverrides,
} from "./config.utils";

/** Options for loadDaemonConfig. Mostly for testing. */
export interface LoadConfigOptions {
  /** Override the config file path. */
  readonly configFile?: string;
  /** Override process.env for testing. */
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
 * @throws If the config file exists but contains invalid JSON or fails schema validation.
 */
export function loadDaemonConfig(options?: LoadConfigOptions): DaemonConfig {
  const defaults: DaemonConfig = buildDefaults();
  const env = options?.env ?? process.env;

  // Determine config file path: explicit option > env var > default
  const configFile =
    options?.configFile ?? env.COMMA_DAEMON_CONFIG_FILE ?? defaults.configFile;

  // Layer 1: defaults
  let config: DaemonConfig = { ...defaults, configFile };

  // Layer 2: JSON config file
  const fileOverrides = readConfigFile(configFile);
  config = { ...config, ...fileOverrides, configFile };

  // Layer 3: env vars (highest priority)
  const envOverrides = readEnvOverrides(env);
  config = { ...config, ...envOverrides, configFile };

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
  const validLevels = ["debug", "info", "warn", "error"];
  if (!validLevels.includes(config.logLevel)) {
    throw new Error(
      `Invalid logLevel: "${config.logLevel}". Must be one of: ${validLevels.join(", ")}.`,
    );
  }

  return config;
}
