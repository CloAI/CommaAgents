import type { DaemonConfig } from "../../config";
import type { Logger } from "../../logger";
import { createLogger } from "../../logger/logger";
import type { LogSink } from "../../logger/logger.types";
import { createFileSink } from "../../logger/sinks/file";
import { createStderrSink } from "../../logger/sinks/stderr";
import { createDaemon } from "../../server/server";
import { removePid, writePid } from "../process/pid/pid";
import { hydrateRegisteredProviders } from "./runtime.utils";

interface DaemonRuntime {
  readonly logger: Logger;
  stop(): Promise<void>;
}

/** Start a daemon server in the current process and attach process-level handlers. */
export async function startDaemonRuntime(
  config: DaemonConfig,
): Promise<DaemonRuntime> {
  const sinks: LogSink[] = [createStderrSink()];
  if (config.logFile) {
    sinks.push(createFileSink(config.logFile));
  }
  const logger = createLogger({ level: config.logLevel, sinks });
  await hydrateRegisteredProviders(logger);

  const daemon = createDaemon({
    config,
    logger,
  });

  try {
    await daemon.start();
  } catch (caughtError) {
    logger.error(`Failed to start daemon: ${caughtError}`);
    logger.close();
    throw caughtError;
  }

  writePid(config.pidFile);
  console.log(
    `Daemon listening on ${config.host}:${daemon.port} (PID: ${process.pid})`,
  );

  const runtime = {
    daemon,
    logger,
    async stop(): Promise<void> {
      await daemon.stop();
      removePid(config.pidFile);
      logger.close();
    },
  };

  // Set Exception and Rejection handlers
  process.on("uncaughtException", (caughtError: Error) => {
    runtime.logger.error("Uncaught exception", {
      name: caughtError.name,
      message: caughtError.message,
      stack: caughtError.stack,
    });
    void runtime.stop().finally(() => {
      process.exit(1);
    });
  });

  process.on("unhandledRejection", (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    runtime.logger.error("Unhandled promise rejection", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  });

  // Shutdown handlers
  let shutdownStarted = false;
  const shutdown = async () => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    console.log("\nShutting down...");
    await runtime.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return runtime;
}
