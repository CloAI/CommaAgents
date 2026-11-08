import { getLogger } from "@logtape/logtape";
import type { DaemonConfig } from "../../config";
import type { DaemonKernel } from "../../daemon-kernel";
import { createDaemonServer } from "../../daemon-server";
import type { DaemonServer } from "../../daemon-server";
import { initializeLogging } from "../../logger";
import { removePid, writePid } from "../process/pid/pid";
import { createConfiguredKernel } from "./kernel";
import type { DaemonRuntime } from "./runtime.types";

const logger = getLogger(["comma", "daemon", "runtime"]);

/**
 * Start the kernel and WebSocket server with application-owned process resources.
 * @param {DaemonConfig} config - Resolved daemon configuration.
 * @returns {Promise<DaemonRuntime>} The running daemon's shutdown handle.
 */
export async function startDaemonRuntime(
  config: DaemonConfig,
): Promise<DaemonRuntime> {
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
  let daemon: DaemonKernel | undefined;
  let server: DaemonServer | undefined;
  let ownsPid = false;
  let stopping: Promise<void> | undefined;

  function stop(): Promise<void> {
    stopping ??= (async () => {
      try {
        await server?.stop();
      } finally {
        try {
          await daemon?.dispose();
        } finally {
          process.off("uncaughtException", onUncaughtException);
          process.off("unhandledRejection", onUnhandledRejection);
          process.off("SIGINT", shutdown);
          process.off("SIGTERM", shutdown);
          try {
            if (ownsPid) {
              removePid(config.pidFile);
            }
          } finally {
            logging.close();
          }
        }
      }
    })();
    return stopping;
  }

  function onUncaughtException(error: Error): void {
    logger.fatal("Uncaught exception", { error });
    void stop().then(
      () => process.exit(1),
      () => process.exit(1),
    );
  }

  function onUnhandledRejection(reason: unknown): void {
    logger.error("Unhandled promise rejection", { error: reason });
  }

  function shutdown(): void {
    void stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  }

  try {
    const kernel = await createConfiguredKernel(config);
    daemon = kernel;
    server = createDaemonServer({
      daemon: kernel,
      host: config.host,
      port: config.port,
    });
    await server.start();
    // Call provider APIs in the background; the list channel publishes each update.
    void kernel.plugins.core.providers.load();
    process.on("uncaughtException", onUncaughtException);
    process.on("unhandledRejection", onUnhandledRejection);
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    logger.info(`Daemon listening at ${server.url}`);
    writePid(config.pidFile);
    ownsPid = true;
    return { stop };
  } catch (error) {
    logger.error("Failed to start daemon", { error });
    try {
      await stop();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Daemon startup and cleanup failed",
      );
    }
    throw error;
  }
}
