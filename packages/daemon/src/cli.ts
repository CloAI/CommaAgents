#!/usr/bin/env bun

import yargs, { type Argv } from "yargs";
import { hideBin } from "yargs/helpers";
import {
  getDaemonStatus,
  restartDaemon,
  startDaemon,
  stopDaemon,
} from "./daemon-control";

interface StartCommandArguments {
  readonly foreground: boolean;
  readonly port?: number;
  readonly modelOverride?: string;
  readonly verbose: boolean;
}

function printDaemonStatus(json: boolean): void {
  const status = getDaemonStatus();
  if (json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (!status.running) {
    console.log("Daemon is not running");
    return;
  }

  console.log(`Daemon is running (PID: ${status.pid})`);
  console.log(`  Config: ${status.configFile}`);
  console.log(`  PID file: ${status.pidFile}`);
  console.log(`  Port: ${status.port}`);
  console.log(`  Host: ${status.host}`);
  if (status.logFile !== undefined) {
    console.log(`  Log file: ${status.logFile}`);
  }
}

async function commandStart({
  foreground,
  port,
  modelOverride,
  verbose,
}: StartCommandArguments): Promise<void> {
  try {
    const result = await startDaemon({
      foreground,
      port,
      modelOverride,
      verbose,
      foregroundEntrypoint: import.meta.path,
    });
    if (!foreground) {
      console.log(result.message);
    }
  } catch (caughtError) {
    console.error(
      caughtError instanceof Error ? caughtError.message : String(caughtError),
    );
    process.exit(1);
  }
}

async function commandStop(): Promise<void> {
  try {
    const result = await stopDaemon();
    console.log(result.message);
  } catch (caughtError) {
    console.error(
      caughtError instanceof Error ? caughtError.message : String(caughtError),
    );
    process.exit(1);
  }
}

async function commandRestart(
  commandArguments: StartCommandArguments,
): Promise<void> {
  try {
    const result = await restartDaemon({
      ...commandArguments,
      foregroundEntrypoint: import.meta.path,
    });
    console.log(result.message);
  } catch (caughtError) {
    console.error(
      caughtError instanceof Error ? caughtError.message : String(caughtError),
    );
    process.exit(1);
  }
}

const startOptions = (commandArguments: Argv): Argv<StartCommandArguments> =>
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
      coerce: (value: number) => {
        if (value < 1 || value > 65535) {
          throw new Error(
            `Invalid port: ${value}. Must be between 1 and 65535.`,
          );
        }
        return value;
      },
    })
    .option("model-override", {
      type: "string",
      describe: "Override model for all agents (e.g., github-copilot/gpt-4o)",
      coerce: (value: string) => {
        if (!value.includes("/")) {
          throw new Error(
            `Invalid model override: "${value}". Expected format: providerID/modelID`,
          );
        }
        return value;
      },
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Enable verbose (debug-level) logging",
    });

yargs(hideBin(process.argv))
  .scriptName("comma-agents-daemon")
  .usage("$0 <command> [options]")
  .command(
    "start",
    "Start the daemon",
    startOptions,
    async (commandArguments) => {
      await commandStart({
        foreground: commandArguments.foreground,
        port: commandArguments.port,
        modelOverride: commandArguments.modelOverride,
        verbose: commandArguments.verbose,
      });
    },
  )
  .command(
    "restart",
    "Restart the daemon",
    startOptions,
    async (commandArguments) => {
      await commandRestart({
        foreground: commandArguments.foreground,
        port: commandArguments.port,
        modelOverride: commandArguments.modelOverride,
        verbose: commandArguments.verbose,
      });
    },
  )
  .command("stop", "Stop the daemon", {}, async () => {
    await commandStop();
  })
  .command(
    "status",
    "Show daemon status",
    (commandArguments) =>
      commandArguments.option("json", {
        type: "boolean",
        default: false,
        describe: "Print the status contract as JSON",
      }),
    (commandArguments) => {
      printDaemonStatus(commandArguments.json);
    },
  )
  .demandCommand(1, "Please specify a command: start, stop, restart, or status")
  .strict()
  .help()
  .alias("h", "help")
  .version(process.env.COMMA_BUILD_VERSION ?? "development")
  .fail((message, error) => {
    if (error) {
      console.error(`Fatal error: ${error.message}`);
    } else if (message) {
      console.error(message);
    }
    process.exit(1);
  })
  .parse();
