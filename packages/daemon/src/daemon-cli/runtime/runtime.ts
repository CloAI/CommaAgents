import { getLogger } from "@logtape/logtape";
import type { DaemonConfig } from "../../config";
import { createDaemonKernel } from "../../daemon-kernel";
import type { DaemonKernel } from "../../daemon-kernel";
import { createDaemonServer } from "../../daemon-server";
import type { DaemonServer } from "../../daemon-server";
import { initializeLogging } from "../../logger";
import { removePid, writePid } from "../process/pid/pid";
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
    level: config.logLevel,
    file: config.logFile,
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
    daemon = await createDaemonKernel({
      runs: {
        runsDir: config.runsDir,
        harness: {
          modelRoles: config.modelRoles,
          instructionFiles: config.instructionFiles,
        },
      },
    });
    server = createDaemonServer({
      daemon,
      host: config.host,
      port: config.port,
    });
    await server.start();
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
