import { sleep } from "bun";
import { loadDaemonConfig } from "../../../config";
import {
  DEFAULT_DAEMON_READY_TIMEOUT_MS,
  DEFAULT_DAEMON_POLL_INTERVAL_MS,
} from "../../../defaults";
import { startDaemonRuntime } from "../../runtime";
import { isRunning, readPid, removePid } from "../pid/pid";
import {
  buildDaemonProcessEnvOverrides,
  buildDaemonProcessForegroundArgs,
  validateDaemonConsoleOptions,
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
  /** Write application logs to stderr; requires foreground mode. */
  readonly console?: boolean;
  /** Console log format; requires foreground mode. */
  readonly consoleFormat?: "text" | "json";
  /** Include agent and tool payloads and enable debug logging. */
  readonly logPayloads?: boolean;
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
  validateDaemonConsoleOptions(options);
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
      message: "Daemon started in foreground",
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
    env: { ...process.env, ...buildDaemonProcessEnvOverrides(options) },
  });
  child.unref();

  const deadline =
    Date.now() +
    (options.readinessTimeoutMs ?? DEFAULT_DAEMON_READY_TIMEOUT_MS);
  let ready = false;
  while (Date.now() < deadline) {
    if (!isRunning(child.pid)) {
      break;
    }
    if (readPid(config.pidFile) === child.pid) {
      ready = true;
      break;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) {
      await sleep(Math.min(DEFAULT_DAEMON_POLL_INTERVAL_MS, remainingMs));
    }
  }

  if (!ready && !isRunning(child.pid)) {
    throw new Error(
      `Daemon process exited before startup completed${config.logFile ? `. Check ${config.logFile}` : ""}`,
    );
  }

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
