#!/usr/bin/env node

import { createHubManager } from "@comma-agents/core/hub";
import {
  type DaemonCommandArguments,
  daemonStartOptions,
  runDaemonCommand,
} from "@comma-agents/daemon";
import type { Argv } from "yargs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { disableAutostart, enableAutostart } from "./autostart";
import { runDoctor } from "./doctor";
import { runInstaller } from "./install";
import { MissingModelRolesError } from "@comma-agents/core";
import {
  describeMissingModelRoles,
  parseModelRoleFlags,
  runModels,
} from "./models";
import { runHeadless } from "./run";
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

function daemonCommandArguments(
  commandArguments: Record<string, unknown>,
): DaemonCommandArguments {
  return {
    foreground: booleanValue(commandArguments.foreground),
    port: optionalNumber(commandArguments.port),
    verbose: booleanValue(commandArguments.verbose),
    console:
      typeof commandArguments.console === "boolean"
        ? commandArguments.console
        : undefined,
    consoleFormat:
      commandArguments.consoleFormat === "text" ||
      commandArguments.consoleFormat === "json"
        ? commandArguments.consoleFormat
        : undefined,
    logPayloads:
      typeof commandArguments.logPayloads === "boolean"
        ? commandArguments.logPayloads
        : undefined,
    json: booleanValue(commandArguments.json),
  };
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
          await runDaemonCommand(
            "start",
            daemonCommandArguments(commandArguments),
            {
              foregroundCommand: resolveSelfDaemonCommand(),
            },
          );
          return;
        }
        case "stop": {
          await runDaemonCommand(
            "stop",
            daemonCommandArguments(commandArguments),
          );
          return;
        }
        case "restart": {
          await runDaemonCommand(
            "restart",
            daemonCommandArguments(commandArguments),
            {
              foregroundCommand: resolveSelfDaemonCommand(),
            },
          );
          return;
        }
        case "status":
          await runDaemonCommand(
            "status",
            daemonCommandArguments(commandArguments),
          );
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
          await runDaemonCommand(
            "logs",
            daemonCommandArguments(commandArguments),
          );
          return;
        }
        default:
          throw new Error(`Unknown daemon action: ${commandArguments.action}`);
      }
    },
  )
  .command(
    "run",
    "Run a strategy headlessly, without the TUI",
    (commandArguments) =>
      commandArguments
        .option("strategy", {
          alias: "s",
          type: "string",
          demandOption: true,
          describe: "Strategy file path, name, or label",
        })
        .option("input", {
          alias: "i",
          type: "string",
          demandOption: true,
          describe: "First user message",
        })
        .option("cwd", {
          type: "string",
          describe: "Working directory for the run",
        })
        .option("model-role", {
          type: "string",
          array: true,
          describe:
            "Model for a role in this run, as role=provider/model; repeat for more roles",
        })
        .option("max-user-turns", {
          type: "number",
          default: 1,
          describe: "User turns accepted before the run stops",
        })
        .option("approve", {
          type: "string",
          choices: ["allow", "deny"] as const,
          default: "deny",
          describe: "Answer for every sandbox permission request",
        })
        .option("then", {
          type: "string",
          array: true,
          describe:
            "Strategies to switch to in order after the first finishes, in the same conversation",
        })
        .option("then-input", {
          type: "string",
          describe: "Message sent to each --then strategy",
        })
        .option("json", {
          type: "boolean",
          default: false,
          describe: "Print a JSON summary instead of streaming text",
        }),
    async (commandArguments) => {
      try {
        const result = await runHeadless({
          strategy: commandArguments.strategy,
          input: commandArguments.input,
          cwd: optionalString(commandArguments.cwd),
          modelRoles: parseModelRoleFlags(commandArguments.modelRole ?? []),
          maxUserTurns: commandArguments.maxUserTurns,
          approve: commandArguments.approve === "allow" ? "allow" : "deny",
          then: commandArguments.then,
          thenInput: optionalString(commandArguments.thenInput),
          json: booleanValue(commandArguments.json),
        });
        process.exit(result.status === "failed" ? 1 : 0);
      } catch (error) {
        if (!(error instanceof MissingModelRolesError)) {
          throw error;
        }
        console.error(describeMissingModelRoles(error.roles));
        process.exit(1);
      }
    },
  )
  .command(
    "models <action> [role] [model]",
    "List or set the models used by @role references",
    (commandArguments) =>
      commandArguments
        .positional("action", { choices: ["list", "set"] as const })
        .positional("role", {
          type: "string",
          describe: "Role name, e.g. medium",
        })
        .positional("model", {
          type: "string",
          describe: "provider/model for the role",
        }),
    (commandArguments) => {
      runModels(
        commandArguments.action === "set" ? "set" : "list",
        optionalString(commandArguments.role),
        optionalString(commandArguments.model),
      );
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
      if (!name) {
        throw new Error(`comma hub ${action} requires a package name`);
      }
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
