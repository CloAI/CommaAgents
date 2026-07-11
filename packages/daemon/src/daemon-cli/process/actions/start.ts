import { loadDaemonConfig } from "../../../config";
import { startDaemonRuntime } from "../../runtime";
import { isRunning, readPid, removePid } from "../pid/pid";
import { DEFAULT_DAEMON_READY_TIMEOUT_MS } from "../process.constants";
import {
  buildDaemonProcessEnvOverrides,
  buildDaemonProcessForegroundArgs,
  waitForDaemonProcessReady,
} from "../process.utils";
import { type DaemonProcessStatus, getDaemonProcessStatus } from "./status";

/** Options for starting, stopping, restarting, or inspecting the daemon process. */
export interface DaemonProcessStartOptions {
  /** Run daemon in the current process instead of detaching. @default false */
  readonly foreground?: boolean;
  /** Override the daemon listening port. */
  readonly port?: number;
  /** Enable debug-level daemon logging. @default false */
  readonly verbose?: boolean;
  /** Treat an already-running daemon as success. @default false */
  readonly allowExisting?: boolean;
  /** Command prefix used to invoke the daemon CLI before start flags. */
  readonly foregroundCommand?: ReadonlyArray<string>;
  /** Maximum time to wait for readiness in milliseconds. @default 3000 */
  readonly readinessTimeoutMs?: number;
  /** Environment used while resolving daemon config. @default process.env */
  readonly env?: Record<string, string | undefined>;
}

/** Result returned after a daemon process start or restart request. */
export interface DaemonProcessStartResult {
  /** Status after the start attempt. */
  readonly status: DaemonProcessStatus;
  /** Whether this call started a new process. */
  readonly started: boolean;
  /** Whether startup used foreground mode. */
  readonly foreground: boolean;
  /** User-facing summary of the result. */
  readonly message: string;
}

export async function startDaemonProcess(
  options: DaemonProcessStartOptions = {},
): Promise<DaemonProcessStartResult> {
  const config = loadDaemonConfig({
    env: buildDaemonProcessEnvOverrides(options),
  });
  const existingPid = readPid(config.pidFile);
  if (existingPid !== undefined && isRunning(existingPid)) {
    const status = getDaemonProcessStatus(options);
    if (options.allowExisting === true) {
      return {
        status,
        started: false,
        foreground: options.foreground === true,
        message: `Daemon is already running (PID: ${existingPid})`,
      };
    }
    throw new Error(`Daemon is already running (PID: ${existingPid})`);
  }

  if (existingPid !== undefined) {
    removePid(config.pidFile);
  }

  if (options.foreground === true) {
    await startDaemonRuntime(config);
    return {
      status: getDaemonProcessStatus(options),
      started: true,
      foreground: true,
      message: "Daemon exited",
    };
  }

  const [command, ...spawnArguments] =
    buildDaemonProcessForegroundArgs(options);
  if (command === undefined) {
    throw new Error("Unable to build daemon foreground command");
  }
  const child = Bun.spawn([command, ...spawnArguments], {
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });
  child.unref();

  const ready = await waitForDaemonProcessReady({
    config,
    timeoutMs: options.readinessTimeoutMs ?? DEFAULT_DAEMON_READY_TIMEOUT_MS,
  });

  const status = getDaemonProcessStatus(options);
  return {
    status,
    started: true,
    foreground: false,
    message:
      ready && status.pid !== undefined
        ? `Daemon started in background (PID: ${status.pid})`
        : "Daemon may still be starting",
  };
}
