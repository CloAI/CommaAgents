import { isRunning, readPid, removePid } from "@comma-agents/utils";
import { loadDaemonConfig } from "../../../config";
import type { DaemonProcessStartOptions } from "..";
import type { DaemonProcessRunState } from "../process.types";
import {
  buildDaemonProcessEnvOverrides,
  readDaemonPackageVersion,
} from "../process.utils";

/** Current daemon process state and resolved connection details. */
export interface DaemonProcessStatus {
  /** Current daemon lifecycle state. */
  readonly state: DaemonProcessRunState;
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
  /** Installed daemon package version, when it can be resolved. */
  readonly version: string | undefined;
  /** Last startup error visible to the process layer, when known. */
  readonly lastStartupError: string | undefined;
}

export function getDaemonProcessStatus(
  options: DaemonProcessStartOptions = {},
): DaemonProcessStatus {
  const config = loadDaemonConfig({
    env: buildDaemonProcessEnvOverrides(options),
  });
  const pid = readPid(config.pidFile);
  const version = readDaemonPackageVersion();
  const statusBase = {
    host: config.host,
    port: config.port,
    configFile: config.configFile,
    pidFile: config.pidFile,
    logFile: config.logFile,
    version,
    lastStartupError: undefined,
  };

  if (pid === undefined) {
    return {
      ...statusBase,
      state: "stopped",
      running: false,
      pid: undefined,
    };
  }

  if (!isRunning(pid)) {
    removePid(config.pidFile);
    return {
      ...statusBase,
      state: "stopped",
      running: false,
      pid: undefined,
    };
  }

  return {
    ...statusBase,
    state: "running",
    running: true,
    pid,
  };
}
