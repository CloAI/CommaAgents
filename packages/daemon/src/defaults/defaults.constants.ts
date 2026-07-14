export const DEFAULT_DAEMON_PORT = 7422;
export const DEFAULT_DAEMON_HOST = "127.0.0.1";
export const DEFAULT_DAEMON_LOG_LEVEL = "info";
export const DEFAULT_DAEMON_LOG_FILENAME = "daemon.log";
export const DEFAULT_DAEMON_PID_FILENAME = "daemon.pid";
export const DEFAULT_DAEMON_CONFIG_FILENAME = "daemon.json";
export const DEFAULT_DAEMON_RUNS_DIRECTORY_NAME = "runs";
export const DEFAULT_DAEMON_PROVIDER_REGISTRY_FILENAME =
  "provider-registry.json";
export const DEFAULT_DAEMON_READY_TIMEOUT_MS = 3_000;
export const DEFAULT_DAEMON_STOP_TIMEOUT_MS = 5_000;
export const DEFAULT_DAEMON_POLL_INTERVAL_MS = 200;

export const PROCESS_ENV_COMMA_DAEMON_PORT =
  process.env.COMMA_DAEMON_PORT || String(DEFAULT_DAEMON_PORT);
export const PROCESS_ENV_COMMA_DAEMON_HOST =
  process.env.COMMA_DAEMON_HOST || DEFAULT_DAEMON_HOST;
export const PROCESS_ENV_COMMA_DAEMON_LOG_LEVEL =
  process.env.COMMA_DAEMON_LOG_LEVEL || DEFAULT_DAEMON_LOG_LEVEL;
export const PROCESS_ENV_COMMA_DAEMON_LOG_FILE =
  process.env.COMMA_DAEMON_LOG_FILE ||
  join(resolveApplicationDataDirectory(), DEFAULT_DAEMON_LOG_FILENAME);
export const PROCESS_ENV_COMMA_DAEMON_PID_FILE =
  process.env.COMMA_DAEMON_PID_FILE ||
  join(resolveApplicationDataDirectory(), DEFAULT_DAEMON_PID_FILENAME);
export const PROCESS_ENV_COMMA_DAEMON_CONFIG_FILE =
  process.env.COMMA_DAEMON_CONFIG_FILE ||
  join(resolveApplicationDataDirectory(), DEFAULT_DAEMON_CONFIG_FILENAME);
export const PROCESS_ENV_COMMA_DAEMON_RUNS_DIR =
  process.env.COMMA_DAEMON_RUNS_DIR ||
  join(resolveApplicationDataDirectory(), DEFAULT_DAEMON_RUNS_DIRECTORY_NAME);
export const PROCESS_ENV_COMMA_BUILD_VERSION = process.env.COMMA_BUILD_VERSION;

import { join } from "node:path";
import { resolveApplicationDataDirectory } from "@comma-agents/core";
