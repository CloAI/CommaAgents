import { join } from "node:path";
import {
  createCredentialStore,
  createJsonFileBackend,
  getProviderDefinition,
  registerProvider,
  registerProviderDefinition,
  setGlobalCredentialStore,
  setProviderCacheDir,
} from "@comma-agents/core";
import { loadDaemonConfig, resolveDataDir } from "../config";
import { createLogger } from "../logger/logger";
import type { LogSink } from "../logger/logger.types";
import { createFileSink } from "../logger/sinks/file";
import { createStderrSink } from "../logger/sinks/stderr";
import { isRunning, readPid, removePid, writePid } from "../pid";
import { loadRegisteredProviders } from "../server/protocol/provider-registry";
import { createDaemon } from "../server/server";
import {
  DAEMON_POLL_INTERVAL_MS,
  DEFAULT_DAEMON_READY_TIMEOUT_MS,
  DEFAULT_DAEMON_STOP_TIMEOUT_MS,
} from "./daemon-control.constants";
import type {
  DaemonStartOptions,
  DaemonStartResult,
  DaemonStatus,
  DaemonStopResult,
  DaemonWaitOptions,
} from "./daemon-control.types";
import {
  buildDaemonEnvOverrides,
  buildDaemonForegroundArgs,
  buildDaemonHealthUrl,
  readDaemonPackageVersion,
} from "./daemon-control.utils";

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function getDaemonStatus(
  options: DaemonStartOptions = {},
): DaemonStatus {
  const config = loadDaemonConfig({
    env: buildDaemonEnvOverrides(options),
  });
  const pid = readPid(config.pidFile);
  if (pid === undefined) {
    return {
      state: "stopped",
      running: false,
      pid: undefined,
      host: config.host,
      port: config.port,
      configFile: config.configFile,
      pidFile: config.pidFile,
      logFile: config.logFile,
      version: readDaemonPackageVersion(),
      lastStartupError: undefined,
    };
  }

  if (!isRunning(pid)) {
    removePid(config.pidFile);
    return {
      state: "stopped",
      running: false,
      pid: undefined,
      host: config.host,
      port: config.port,
      configFile: config.configFile,
      pidFile: config.pidFile,
      logFile: config.logFile,
      version: readDaemonPackageVersion(),
      lastStartupError: undefined,
    };
  }

  return {
    state: "running",
    running: true,
    pid,
    host: config.host,
    port: config.port,
    configFile: config.configFile,
    pidFile: config.pidFile,
    logFile: config.logFile,
    version: readDaemonPackageVersion(),
    lastStartupError: undefined,
  };
}

export async function waitForDaemonReady({
  config,
  timeoutMs,
}: DaemonWaitOptions): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const remainingMs = deadline - Date.now();
      const response = await fetch(buildDaemonHealthUrl(config), {
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(DAEMON_POLL_INTERVAL_MS, remainingMs)),
        ),
      });
      if (response.ok) {
        return true;
      }
    } catch {
      await sleep(DAEMON_POLL_INTERVAL_MS);
    }
  }
  return false;
}

export async function startDaemon(
  options: DaemonStartOptions = {},
): Promise<DaemonStartResult> {
  const config = loadDaemonConfig({
    env: buildDaemonEnvOverrides(options),
  });
  const existingPid = readPid(config.pidFile);
  if (existingPid !== undefined && isRunning(existingPid)) {
    const status = getDaemonStatus(options);
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
    await runDaemonForeground(options);
    return {
      status: getDaemonStatus(options),
      started: true,
      foreground: true,
      message: "Daemon exited",
    };
  }

  const [command, ...spawnArguments] = buildDaemonForegroundArgs(options);
  if (command === undefined) {
    throw new Error("Unable to build daemon foreground command");
  }
  const child = Bun.spawn([command, ...spawnArguments], {
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });
  child.unref();

  const ready = await waitForDaemonReady({
    config,
    timeoutMs: options.readinessTimeoutMs ?? DEFAULT_DAEMON_READY_TIMEOUT_MS,
  });
  const status = getDaemonStatus(options);
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

export async function runDaemonForeground(
  options: DaemonStartOptions = {},
): Promise<void> {
  const config = loadDaemonConfig({
    env: buildDaemonEnvOverrides(options),
  });
  const sinks: LogSink[] = [createStderrSink()];
  if (config.logFile) {
    sinks.push(createFileSink(config.logFile));
  }
  const logger = createLogger({ level: config.logLevel, sinks });

  const dataDir = resolveDataDir();
  const credentialBackend = createJsonFileBackend({
    filePath: join(dataDir, "credentials.json"),
  });
  const credentialStore = createCredentialStore({ backend: credentialBackend });
  setGlobalCredentialStore(credentialStore);
  setProviderCacheDir(config.providerCacheDir);

  for (const providerId of loadRegisteredProviders()) {
    try {
      const definition = await getProviderDefinition(providerId);
      if (definition) {
        registerProviderDefinition(definition);
        registerProvider(providerId, {
          packageName: definition.packageName ?? `@ai-sdk/${providerId}`,
        });
      }
    } catch {}
  }

  process.on("uncaughtException", (caughtError: Error) => {
    logger.error("Uncaught exception", {
      name: caughtError.name,
      message: caughtError.message,
      stack: caughtError.stack,
    });
  });

  process.on("unhandledRejection", (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error("Unhandled promise rejection", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  });

  const daemon = createDaemon({
    config,
    logger,
    modelOverride: options.modelOverride,
  });

  try {
    await daemon.start();
  } catch (caughtError) {
    logger.error(`Failed to start daemon: ${caughtError}`);
    throw caughtError;
  }

  writePid(config.pidFile);
  console.log(
    `Daemon listening on ${config.host}:${daemon.port} (PID: ${process.pid})`,
  );
  if (options.modelOverride) {
    console.log(`  Model override: ${options.modelOverride}`);
  }

  const shutdown = async () => {
    console.log("\nShutting down...");
    await daemon.stop();
    removePid(config.pidFile);
    logger.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export async function stopDaemon(
  options: DaemonStartOptions = {},
): Promise<DaemonStopResult> {
  const config = loadDaemonConfig({
    env: buildDaemonEnvOverrides(options),
  });
  const pid = readPid(config.pidFile);
  if (pid === undefined) {
    return {
      status: getDaemonStatus(options),
      stopped: false,
      message: "Daemon is not running (no PID file found)",
    };
  }

  if (!isRunning(pid)) {
    removePid(config.pidFile);
    return {
      status: getDaemonStatus(options),
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
        status: getDaemonStatus(options),
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

export async function restartDaemon(
  options: DaemonStartOptions = {},
): Promise<DaemonStartResult> {
  await stopDaemon(options);
  return startDaemon(options);
}
