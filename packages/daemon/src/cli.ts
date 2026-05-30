#!/usr/bin/env bun

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
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { loadDaemonConfig, resolveDataDir } from "./config";
import { createLogger } from "./logger/logger";
import type { LogSink } from "./logger/logger.types";
import { createFileSink } from "./logger/sinks/file";
import { createStderrSink } from "./logger/sinks/stderr";
import { isRunning, readPid, removePid, writePid } from "./pid";
import { loadRegisteredProviders } from "./server/protocol/provider-registry";
import { createDaemon } from "./server/server";

// Argument parsing via yargs

interface StartArgs {
  foreground: boolean;
  port?: number;
  modelOverride?: string;
  verbose: boolean;
}

// Command: start

async function commandStart(args: StartArgs): Promise<void> {
  // Load config with optional port override
  const envOverrides: Record<string, string | undefined> = { ...process.env };
  if (args.port !== undefined) {
    envOverrides.COMMA_DAEMON_PORT = String(args.port);
  }
  if (args.verbose) {
    envOverrides.COMMA_DAEMON_LOG_LEVEL = "debug";
  }
  const config = loadDaemonConfig({ env: envOverrides });

  // Check if daemon is already running
  const existingPid = readPid(config.pidFile);
  if (existingPid !== undefined && isRunning(existingPid)) {
    console.error(`Daemon is already running (PID: ${existingPid})`);
    process.exit(1);
  }

  // Clean up stale PID file if present
  if (existingPid !== undefined) {
    removePid(config.pidFile);
  }

  // Background mode: spawn a detached child and exit
  if (!args.foreground) {
    const spawnArgs = [
      "bun",
      "-i",
      "run",
      import.meta.path,
      "start",
      "--foreground",
    ];
    if (args.port !== undefined) {
      spawnArgs.push("--port", String(args.port));
    }
    if (args.modelOverride !== undefined) {
      spawnArgs.push("--model-override", args.modelOverride);
    }
    if (args.verbose) {
      spawnArgs.push("--verbose");
    }

    const child = Bun.spawn(spawnArgs, {
      stdio: ["ignore", "ignore", "ignore"],
      detached: true,
    });
    child.unref();

    // Brief poll to verify PID file appears
    const deadline = Date.now() + 3000;
    let started = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
      const pid = readPid(config.pidFile);
      if (pid !== undefined && isRunning(pid)) {
        console.log(`Daemon started in background (PID: ${pid})`);
        started = true;
        break;
      }
    }

    if (!started) {
      console.log(
        "Daemon may still be starting. Check status with: comma-agents-daemon status",
      );
    }

    process.exit(0);
  }

  // Foreground mode: run the daemon in this process
  // 1. Set up logger
  const sinks: LogSink[] = [createStderrSink()];
  if (config.logFile) {
    sinks.push(createFileSink(config.logFile));
  }
  const logger = createLogger({ level: config.logLevel, sinks });

  // 2. Set up credential store (global registry)
  const dataDir = resolveDataDir();
  const credentialBackend = createJsonFileBackend({
    filePath: join(dataDir, "credentials.json"),
  });
  const credentialStore = createCredentialStore({ backend: credentialBackend });
  setGlobalCredentialStore(credentialStore);

  // 2b. Set provider cache directory for dynamic package installs
  setProviderCacheDir(config.providerCacheDir);

  // 2c. Restore previously registered providers from disk
  for (const providerId of loadRegisteredProviders()) {
    try {
      const definition = await getProviderDefinition(providerId);
      if (definition) {
        registerProviderDefinition(definition);
        registerProvider(providerId, {
          packageName: definition.packageName ?? `@ai-sdk/${providerId}`,
        });
      }
    } catch {
      // Provider may no longer be available — skip silently
    }
  }

  // 3. Register global exception handlers so all uncaught errors reach the log
  process.on("uncaughtException", (caughtError: Error) => {
    logger.error("Uncaught exception", {
      name: caughtError.name,
      message: caughtError.message,
      stack: caughtError.stack,
    });
  });

  process.on("unhandledRejection", (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error("Unhandled promise rejection", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
  });

  // 4. Create and start daemon
  const daemon = createDaemon({
    config,
    logger,
    modelOverride: args.modelOverride,
  });

  try {
    await daemon.start();
  } catch (caughtError) {
    logger.error(`Failed to start daemon: ${caughtError}`);
    console.error(
      `Failed to start daemon: ${caughtError instanceof Error ? caughtError.message : caughtError}`,
    );
    process.exit(1);
  }

  // 5. Write PID file
  writePid(config.pidFile);

  console.log(
    `Daemon listening on ${config.host}:${daemon.port} (PID: ${process.pid})`,
  );
  if (args.modelOverride) {
    console.log(`  Model override: ${args.modelOverride}`);
  }
  // 6. Signal handlers for graceful shutdown
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

// Command: stop

async function commandStop(): Promise<void> {
  const config = loadDaemonConfig();

  const pid = readPid(config.pidFile);
  if (pid === undefined) {
    console.log("Daemon is not running (no PID file found)");
    process.exit(0);
  }

  if (!isRunning(pid)) {
    console.log("Daemon is not running (stale PID file cleaned up)");
    removePid(config.pidFile);
    process.exit(0);
  }

  // Send SIGTERM
  console.log(`Stopping daemon (PID: ${pid})...`);
  try {
    process.kill(pid, "SIGTERM");
  } catch (caughtError) {
    console.error(
      `Failed to send SIGTERM: ${caughtError instanceof Error ? caughtError.message : caughtError}`,
    );
    process.exit(1);
  }

  // Poll until the process dies (5 second timeout)
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!isRunning(pid)) {
      removePid(config.pidFile);
      console.log("Daemon stopped");
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.error(
    "Daemon did not stop within 5 seconds. You may need to kill it manually.",
  );
  console.error(`  kill -9 ${pid}`);
  process.exit(1);
}

// Command: status

function commandStatus(): void {
  const config = loadDaemonConfig();

  const pid = readPid(config.pidFile);
  if (pid === undefined) {
    console.log("Daemon is not running");
    process.exit(0);
  }

  if (!isRunning(pid)) {
    console.log("Daemon is not running (stale PID file cleaned up)");
    removePid(config.pidFile);
    process.exit(0);
  }

  console.log(`Daemon is running (PID: ${pid})`);
  console.log(`  Config: ${config.configFile}`);
  console.log(`  PID file: ${config.pidFile}`);
  console.log(`  Port: ${config.port}`);
  console.log(`  Host: ${config.host}`);
}

// Command: help — now handled by yargs --help

// Main — yargs command routing

yargs(hideBin(process.argv))
  .scriptName("comma-agents-daemon")
  .usage("$0 <command> [options]")
  .command(
    "start",
    "Start the daemon",
    (commandArguments) =>
      commandArguments
        .option("foreground", {
          alias: "f",
          type: "boolean",
          default: false,
          describe: "Run in foreground (don't daemonize)",
        })
        .option("port", {
          alias: "p",
          type: "number",
          describe: "Override the listening port",
          coerce: (val: number) => {
            if (val < 1 || val > 65535) {
              throw new Error(
                `Invalid port: ${val}. Must be between 1 and 65535.`,
              );
            }
            return val;
          },
        })
        .option("model-override", {
          type: "string",
          describe:
            "Override model for all agents (e.g., github-copilot/gpt-4o)",
          coerce: (val: string) => {
            if (!val.includes("/")) {
              throw new Error(
                `Invalid model override: "${val}". Expected format: providerID/modelID`,
              );
            }
            return val;
          },
        })
        .option("verbose", {
          alias: "v",
          type: "boolean",
          default: false,
          describe: "Enable verbose (debug-level) logging",
        })
        .example("$0 start", "Start in background")
        .example("$0 start --foreground", "Start in foreground")
        .example("$0 start --port 8080", "Start on port 8080")
        .example(
          "$0 start --foreground --model-override github-copilot/gpt-4o",
          "Start with model override",
        ),
    async (argv) => {
      await commandStart({
        foreground: argv.foreground,
        port: argv.port,
        modelOverride: argv.modelOverride as string | undefined,
        verbose: argv.verbose,
      });
    },
  )
  .command("stop", "Stop the daemon", {}, async () => {
    await commandStop();
  })
  .command("status", "Show daemon status", {}, () => {
    commandStatus();
  })
  .demandCommand(1, "Please specify a command: start, stop, or status")
  .strict()
  .help()
  .alias("h", "help")
  .version(false)
  .fail((msg, err) => {
    if (err) {
      console.error(`Fatal error: ${err.message}`);
    } else if (msg) {
      console.error(msg);
    }
    process.exit(1);
  })
  .parse();
