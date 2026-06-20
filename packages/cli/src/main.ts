#!/usr/bin/env bun

import {
  getDaemonStatus,
  restartDaemon,
  startDaemon,
  stopDaemon,
} from "@comma-agents/daemon";
import type { Argv } from "yargs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { disableAutostart, enableAutostart } from "./autostart";
import { runDoctor } from "./doctor";
import { runInstaller } from "./install";
import { launchTui } from "./tui";
import { resolveSelfDaemonCommand } from "./tui/tui.utils";

interface TuiCommandArguments {
  readonly strategy?: string;
  readonly input?: string;
  readonly daemonUrl?: string;
  readonly dev?: boolean;
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
  console.log(`  Host: ${status.host}`);
  console.log(`  Port: ${status.port}`);
  console.log(`  Config: ${status.configFile}`);
  console.log(`  PID file: ${status.pidFile}`);
  if (status.logFile !== undefined) {
    console.log(`  Log file: ${status.logFile}`);
  }
}

function printDoctor(json: boolean): void {
  const result = runDoctor();
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Doctor status: ${result.status}`);
  for (const check of result.checks) {
    console.log(
      `${check.status.toUpperCase()} ${check.label}: ${check.message}`,
    );
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

async function runTuiCommand(
  commandArguments: TuiCommandArguments,
): Promise<void> {
  const exitCode = await launchTui(commandArguments);
  process.exit(exitCode);
}

const tuiOptions = (commandArguments: Argv) =>
  commandArguments
    .option("strategy", {
      alias: "s",
      type: "string",
      describe: "Strategy name to run",
    })
    .option("daemon-url", {
      alias: "d",
      type: "string",
      describe: "Daemon WebSocket URL",
    })
    .option("input", {
      alias: "i",
      type: "string",
      describe: "Initial input message",
    })
    .option("dev", {
      alias: "D",
      type: "boolean",
      default: false,
      describe: "Enable TUI development mode",
    });

const daemonStartOptions = (commandArguments: Argv) =>
  commandArguments
    .option("foreground", {
      alias: "f",
      type: "boolean",
      default: false,
      describe: "Run in foreground",
    })
    .option("port", {
      alias: "p",
      type: "number",
      describe: "Override the daemon port",
    })
    .option("model-override", {
      type: "string",
      describe: "Override model for all agents as provider/model",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Enable debug logging",
    });

yargs(hideBin(process.argv))
  .scriptName("comma")
  .usage("$0 [command] [options]")
  .command(
    "$0",
    "Open the CommaAgents TUI",
    tuiOptions,
    async (commandArguments) => {
      await runTuiCommand({
        strategy: optionalString(commandArguments.strategy),
        input: optionalString(commandArguments.input),
        daemonUrl: optionalString(commandArguments.daemonUrl),
        dev: booleanValue(commandArguments.dev),
      });
    },
  )
  .command(
    "tui",
    "Open the CommaAgents TUI",
    tuiOptions,
    async (commandArguments) => {
      await runTuiCommand({
        strategy: optionalString(commandArguments.strategy),
        input: optionalString(commandArguments.input),
        daemonUrl: optionalString(commandArguments.daemonUrl),
        dev: booleanValue(commandArguments.dev),
      });
    },
  )
  .command(
    "daemon <action>",
    "Manage the daemon",
    (commandArguments) =>
      daemonStartOptions(commandArguments)
        .positional("action", {
          type: "string",
          choices: [
            "start",
            "stop",
            "restart",
            "status",
            "enable",
            "disable",
            "logs",
          ] as const,
          describe: "Daemon action",
        })
        .option("json", {
          type: "boolean",
          default: false,
          describe: "Print machine-readable output",
        }),
    async (commandArguments) => {
      switch (commandArguments.action) {
        case "start": {
          const result = await startDaemon({
            foregroundCommand: resolveSelfDaemonCommand(),
            foreground: booleanValue(commandArguments.foreground),
            port: optionalNumber(commandArguments.port),
            modelOverride: optionalString(commandArguments.modelOverride),
            verbose: booleanValue(commandArguments.verbose),
          });
          console.log(result.message);
          return;
        }
        case "stop": {
          const result = await stopDaemon();
          console.log(result.message);
          return;
        }
        case "restart": {
          const result = await restartDaemon({
            foregroundCommand: resolveSelfDaemonCommand(),
            foreground: booleanValue(commandArguments.foreground),
            port: optionalNumber(commandArguments.port),
            modelOverride: optionalString(commandArguments.modelOverride),
            verbose: booleanValue(commandArguments.verbose),
          });
          console.log(result.message);
          return;
        }
        case "status":
          printDaemonStatus(booleanValue(commandArguments.json));
          return;
        case "enable": {
          const plan = await enableAutostart();
          console.log(`Enabled daemon autostart via ${plan.description}`);
          return;
        }
        case "disable": {
          const plan = await disableAutostart();
          console.log(`Disabled daemon autostart via ${plan.description}`);
          return;
        }
        case "logs": {
          const status = getDaemonStatus();
          console.log(status.logFile ?? "Daemon log file is not configured");
          return;
        }
        default:
          throw new Error(`Unknown daemon action: ${commandArguments.action}`);
      }
    },
  )
  .command("install", "Open the terminal installer", {}, async () => {
    await runInstaller();
  })
  .command("update", "Show update instructions", {}, () => {
    console.log("Update with: npm install -g @comma-agents/cli@latest");
  })
  .command("uninstall", "Show uninstall instructions", {}, () => {
    console.log("Uninstall with: npm uninstall -g @comma-agents/cli");
  })
  .command(
    "doctor",
    "Validate the local CommaAgents installation",
    (commandArguments) =>
      commandArguments.option("json", {
        type: "boolean",
        default: false,
        describe: "Print machine-readable output",
      }),
    (commandArguments) => {
      printDoctor(booleanValue(commandArguments.json));
    },
  )
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
