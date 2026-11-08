import { createConfiguredKernel } from "@daemon-src/daemon-cli/runtime/kernel";
import { readPid, isRunning } from "@daemon-src/daemon-cli/process/pid/pid";
import type { DaemonConfig } from "@daemon-src/config";
import { initializeLogging } from "@daemon-src/logger";
import { createDaemonElectronIPC } from "./daemon-ipc";
import type { CreateDaemonElectronIPCOptions } from "./daemon-ipc";

/** Application-owned lifetime of the in-process daemon. */
interface DaemonElectronRuntime {
  /** Disconnect clients, dispose the kernel and release logging once. */
  stop(): Promise<void>;
}

/**
 * Start the daemon kernel inside the Electron main process.
 *
 * Mirrors `startDaemonRuntime`, but exposes no WebSocket server: clients reach the
 * kernel through Electron IPC. It writes no pid file and installs no process
 * signal handlers; the application calls `stop` when it quits.
 * @param {DaemonConfig} config - Resolved daemon configuration.
 * @param {Pick<CreateDaemonElectronIPCOptions, "ipcMain" | "isTrusted">} ipc - IPC hub and sender trust check.
 * @returns {DaemonElectronRuntime} The shutdown handle; startup failures are reported to each connecting window.
 */
export function startDaemonElectronRuntime(
  config: DaemonConfig,
  ipc: Pick<CreateDaemonElectronIPCOptions, "ipcMain" | "isTrusted">,
): DaemonElectronRuntime {
  const logging = initializeLogging({
    level:
      config.logPayloads && config.logLevel !== "trace"
        ? "debug"
        : config.logLevel,
    file: config.logFile,
    stderr: config.console,
    consoleFormat:
      config.consoleFormat ?? (config.console === true ? "text" : "json"),
  });

  const kernel = (async () => {
    // This guards only against a standalone daemon that is already running. A
    // standalone daemon started after the app is not detected, so both can then
    // write the same runs directory.
    const standalonePid = readPid(config.pidFile);
    if (standalonePid !== undefined && isRunning(standalonePid)) {
      throw new Error(
        "A standalone daemon is running. Stop it, or use the web UI.",
      );
    }
    const created = await createConfiguredKernel(config);
    // Call provider APIs in the background; the list channel publishes each update.
    void created.plugins.core.providers.load();
    return created;
  })();
  // IPC is registered immediately so a failed start reaches windows as a close reason.
  const server = createDaemonElectronIPC({ ...ipc, kernel });

  let stopping: Promise<void> | undefined;
  return {
    stop() {
      stopping ??= (async () => {
        try {
          await server.stop();
        } finally {
          try {
            await (await kernel.catch(() => undefined))?.dispose();
          } finally {
            logging.close();
          }
        }
      })();
      return stopping;
    },
  };
}
