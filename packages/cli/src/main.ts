#!/usr/bin/env bun

import { createHubManager } from "@comma-agents/core/hub";
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
import { runUninstaller } from "./uninstall";
import { runUpdater } from "./update";

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
  .command(
    "hub <action> [name]",
    "Manage CommaAgents Hub packages",
    (commandArguments) =>
      commandArguments
        .positional("action", {
          type: "string",
          choices: ["list", "install", "update", "remove"] as const,
          describe: "Hub package action",
        })
        .positional("name", {
          type: "string",
          describe: "Scoped Hub package name",
        })
        .option("allow-code", {
          type: "boolean",
          default: false,
          describe: "Approve installation of package executable code",
        })
        .option("json", {
          type: "boolean",
          default: false,
          describe: "Print machine-readable output",
        }),
    async (commandArguments) => {
      const manager = createHubManager();
      const action = commandArguments.action;
      if (action === "list") {
        const [available, installed] = await Promise.all([
          manager.listAvailable(),
          manager.listInstalled(),
        ]);
        const installedByName = new Map(
          installed.map((item) => [item.name, item]),
        );
        const packages = available.map((item) => ({
          ...item,
          installedVersion: installedByName.get(item.name)?.version,
        }));
        if (booleanValue(commandArguments.json)) {
          console.log(JSON.stringify(packages, null, 2));
        } else {
          for (const item of packages) {
            const state = item.installedVersion
              ? item.installedVersion === item.version
                ? "installed"
                : `update available from ${item.installedVersion}`
              : "available";
            console.log(`${item.name}@${item.version} (${state})`);
          }
        }
        return;
      }

      const name = optionalString(commandArguments.name);
      if (!name) throw new Error(`comma hub ${action} requires a package name`);
      if (action === "remove") {
        const removed = await manager.remove(name);
        console.log(removed ? `Removed ${name}` : `${name} is not installed`);
        return;
      }
      const options = { allowCode: booleanValue(commandArguments.allowCode) };
      const installed =
        action === "install"
          ? await manager.install(name, options)
          : await manager.update(name, options);
      console.log(
        `${action === "install" ? "Installed" : "Updated"} ${installed.name}@${installed.version}`,
      );
    },
  )
  .command(
    "update",
    "Check for and install CLI updates",
    (commandArguments) =>
      commandArguments
        .option("yes", {
          alias: "y",
          type: "boolean",
          default: false,
          describe: "Install the update without prompting",
        })
        .option("check", {
          type: "boolean",
          default: false,
          describe: "Only report whether an update is available",
        }),
    async (commandArguments) => {
      await runUpdater({
        confirmed: booleanValue(commandArguments.yes),
        checkOnly: booleanValue(commandArguments.check),
      });
    },
  )
  .command(
    "uninstall",
    "Remove CommaAgents and optionally delete user data",
    (commandArguments) =>
      commandArguments
        .option("yes", {
          alias: "y",
          type: "boolean",
          default: false,
          describe: "Confirm uninstall without prompting",
        })
        .option("remove-history", {
          type: "boolean",
          describe: "Remove conversation history",
        })
        .option("remove-packages", {
          type: "boolean",
          describe: "Remove installed Hub and provider packages",
        })
        .option("remove-config", {
          type: "boolean",
          describe:
            "Remove credentials, config, logs, trash, skills, and strategies",
        }),
    async (commandArguments) => {
      await runUninstaller({
        confirmed: booleanValue(commandArguments.yes),
        removeHistory:
          typeof commandArguments.removeHistory === "boolean"
            ? commandArguments.removeHistory
            : undefined,
        removePackages:
          typeof commandArguments.removePackages === "boolean"
            ? commandArguments.removePackages
            : undefined,
        removeConfig:
          typeof commandArguments.removeConfig === "boolean"
            ? commandArguments.removeConfig
            : undefined,
      });
    },
  )
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
