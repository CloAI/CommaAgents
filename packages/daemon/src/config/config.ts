// Daemon configuration with layered resolution: defaults → JSON file → env vars.
//
// Platform-aware defaults use core's resolveDataDir():
//   Linux:   ~/.local/share/comma-agents/
//   macOS:   ~/Library/Application Support/comma-agents/
//   Windows: %LOCALAPPDATA%/comma-agents/
//
// Resolution order (highest priority wins):
//   1. Environment variables (COMMA_DAEMON_PORT, etc.)
//   2. JSON config file (~/.local/share/comma-agents/daemon.json or platform equiv)
//   3. Built-in defaults

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDataDir } from "@comma-agents/core";
import { z } from "zod";
import type { LogLevel } from "../logger/logger.types";

// Re-export resolveDataDir so existing daemon consumers keep working.
export { resolveDataDir } from "@comma-agents/core";

// Config Zod schema

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
  })
  .strict();

export type DaemonConfigFile = z.infer<typeof DaemonConfigFileSchema>;

// Resolved config — all fields are required (defaults filled in)

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
}

// Defaults

function buildDefaults(): DaemonConfig {
  const dataDir = resolveDataDir();
  return {
    port: 7422,
    host: "127.0.0.1",
    logLevel: "info",
    logFile: undefined,
    providerCacheDir: join(dataDir, "providers"),
    pidFile: join(dataDir, "daemon.pid"),
    configFile: join(dataDir, "daemon.json"),
  };
}

// Environment variable overrides

/** Map of env var names → config keys + parsers. */
const ENV_MAP: Array<{
  env: string;
  key: keyof DaemonConfig;
  parse: (val: string) => unknown;
}> = [
  { env: "COMMA_DAEMON_PORT", key: "port", parse: (v) => parseInt(v, 10) },
  { env: "COMMA_DAEMON_HOST", key: "host", parse: (v) => v },
  { env: "COMMA_DAEMON_LOG_LEVEL", key: "logLevel", parse: (v) => v },
  { env: "COMMA_DAEMON_LOG_FILE", key: "logFile", parse: (v) => v },
  { env: "COMMA_DAEMON_PROVIDER_CACHE_DIR", key: "providerCacheDir", parse: (v) => v },
  { env: "COMMA_DAEMON_PID_FILE", key: "pidFile", parse: (v) => v },
];

function readEnvOverrides(env: Record<string, string | undefined>): Partial<DaemonConfig> {
  const overrides: Record<string, unknown> = {};
  for (const { env: envKey, key, parse } of ENV_MAP) {
    const raw = env[envKey];
    if (raw !== undefined && raw !== "") {
      overrides[key] = parse(raw);
    }
  }
  return overrides as Partial<DaemonConfig>;
}

// JSON config file loader

function readConfigFile(filePath: string): Partial<DaemonConfig> {
  if (!existsSync(filePath)) {
    return {};
  }

  const raw = readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  const parsed = DaemonConfigFileSchema.parse(json);

  // Convert to Partial<DaemonConfig> (only defined fields)
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<DaemonConfig>;
}

// loadDaemonConfig() — the public API

/** Options for loadDaemonConfig. Mostly for testing. */
export interface LoadConfigOptions {
  /** Override the config file path. */
  configFile?: string;
  /** Override process.env for testing. */
  env?: Record<string, string | undefined>;
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
  const defaults = buildDefaults();
  const env = options?.env ?? process.env;

  // Determine config file path: explicit option > env var > default
  const configFile = options?.configFile ?? env.COMMA_DAEMON_CONFIG_FILE ?? defaults.configFile;

  // Layer 1: defaults
  let config: DaemonConfig = { ...defaults, configFile };

  // Layer 2: JSON config file
  const fileOverrides = readConfigFile(configFile);
  config = { ...config, ...fileOverrides, configFile };

  // Layer 3: env vars (highest priority)
  const envOverrides = readEnvOverrides(env);
  config = { ...config, ...envOverrides, configFile };

  // Validate the final port is in range
  if (config.port < 1 || config.port > 65535 || !Number.isInteger(config.port)) {
    throw new Error(`Invalid port: ${config.port}. Must be an integer between 1 and 65535.`);
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
