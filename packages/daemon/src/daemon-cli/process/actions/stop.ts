import { isRunning, readPid, removePid } from "@comma-agents/utils";
import { sleep } from "bun";
import { loadDaemonConfig } from "../../../config";
import {
  type DaemonProcessStartOptions,
  type DaemonProcessStatus,
  getDaemonProcessStatus,
} from "..";
import {
  DAEMON_POLL_INTERVAL_MS,
  DEFAULT_DAEMON_STOP_TIMEOUT_MS,
} from "../process.constants";
import { buildDaemonProcessEnvOverrides } from "../process.utils";

/** Result returned after a daemon process stop request. */
export interface DaemonProcessStopResult {
  /** Status after the stop attempt. */
  readonly status: DaemonProcessStatus;
  /** Whether this call stopped a live daemon process. */
  readonly stopped: boolean;
  /** User-facing summary of the result. */
  readonly message: string;
}

export async function stopDaemonProcess(
  options: DaemonProcessStartOptions = {},
): Promise<DaemonProcessStopResult> {
  const config = loadDaemonConfig({
    env: buildDaemonProcessEnvOverrides(options),
  });
  const pid = readPid(config.pidFile);
  if (pid === undefined) {
    return {
      status: getDaemonProcessStatus(options),
      stopped: false,
      message: "Daemon is not running (no PID file found)",
    };
  }

  if (!isRunning(pid)) {
    removePid(config.pidFile);
    return {
      status: getDaemonProcessStatus(options),
      stopped: false,
      message: "Daemon is not running (stale PID file cleaned up)",
    };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (caughtError) {
    throw new Error(
      `Failed to send SIGTERM: ${
        caughtError instanceof Error ? caughtError.message : String(caughtError)
      }`,
    );
  }

  const deadline = Date.now() + DEFAULT_DAEMON_STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!isRunning(pid)) {
      removePid(config.pidFile);
      return {
        status: getDaemonProcessStatus(options),
        stopped: true,
        message: "Daemon stopped",
      };
    }
    await sleep(DAEMON_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Daemon did not stop within ${
      DEFAULT_DAEMON_STOP_TIMEOUT_MS / 1000
    } seconds. You may need to kill it manually: kill -9 ${pid}`,
  );
}
