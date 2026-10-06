import { getLogger } from "@logtape/logtape";
import type { DaemonConfig } from "../../config";
import { initializeLogging } from "../../logger";
import { createDaemon } from "../../server/createDaemon";
import { removePid, writePid } from "../process/pid/pid";
import { hydrateRegisteredProviders } from "./runtime.utils";

const logger = getLogger(["comma", "daemon", "runtime"]);

interface DaemonRuntime {
  stop(): Promise<void>;
}

/**
 * Start the daemon and own application logging and process handlers.
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
  let initializeDaemon: ReturnType<typeof createDaemon> | undefined;
  
  // Start the daemon, and determine any issues with the startup.
  try {
    // AI: Can we remove the "hydrateRegisteredProviders" here and include it more in the 
    // daemon itself, as it adds noise here, and the createDaemon should have a "hydrate" phase.
    await hydrateRegisteredProviders();
    initializeDaemon = createDaemon({ config });
    await initializeDaemon.start();
    writePid(config.pidFile);
  } catch (error) {
    logger.error("Failed to start daemon", { error });
    try {
      await initializeDaemon?.stop();
    } catch (cleanupError) {
      logger.error("Failed to clean up daemon after startup failure", {
        error: cleanupError,
      });
    } finally {
      logging.close();
    }
    throw error;
  }

  const runningDaemon = initializeDaemon;
  // AI: This seems like an awkward code, empty "stopping" variable...
  // Not sure if we really should be "defining a runtime" adhoc here.
  // Ideally the Daemon can just have this built into it its definition, removing this
  // dangling wrapup code and the need to having a "temp" initializeDaemon just to reuse 
  // it here...
  let stopping: Promise<void> | undefined;
  const runtime: DaemonRuntime = {
    stop() {
      stopping ??= (async () => {
        try {
          await runningDaemon.stop();
        } finally {
          process.off("uncaughtException", onUncaughtException);
          process.off("unhandledRejection", onUnhandledRejection);
          process.off("SIGINT", shutdown);
          process.off("SIGTERM", shutdown);
          try {
            removePid(config.pidFile);
          } finally {
            logging.close();
          }
        }
      })();
      return stopping;
    },
  };

  function onUncaughtException(error: Error): void {
    logger.fatal("Uncaught exception", { error });
    void runtime.stop().then(
      () => process.exit(1),
      () => process.exit(1),
    );
  }

  function onUnhandledRejection(reason: unknown): void {
    logger.error("Unhandled promise rejection", { error: reason });
  }

  function shutdown(): void {
    void runtime.stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  }

  process.on("uncaughtException", onUncaughtException);
  process.on("unhandledRejection", onUnhandledRejection);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return runtime;
}
