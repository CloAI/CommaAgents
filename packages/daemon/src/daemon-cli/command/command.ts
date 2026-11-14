import type { Argv } from "yargs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { PROCESS_ENV_COMMA_BUILD_VERSION } from "../../defaults";
import { processDaemonCommand } from "../process";
import type {
  DaemonCommandArguments,
  DaemonCommandOptions,
  DaemonCommandYargsArguments,
} from "./command.types";

export { processDaemonCommand as runDaemonCommand } from "../process";

export const daemonStartOptions = (
  commandArguments: Argv,
): Argv<DaemonCommandArguments> =>
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
      coerce: (value: number) => {
        if (value < 1 || value > 65535) {
          throw new Error(
            `Invalid port: ${value}. Must be between 1 and 65535.`,
          );
        }
        return value;
      },
    })
    .option("console", {
      type: "boolean",
      describe:
        "Write logs to stderr (requires --foreground); use --no-console to disable",
    })
    .option("console-format", {
      type: "string",
      choices: ["text", "json"] as const,
      describe: "Console log format (requires --foreground)",
    })
    .option("log-payloads", {
      type: "boolean",
      describe: "Include agent and tool payloads and enable debug logging",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Enable debug logging",
    });

export const daemonStatusOptions = (
  commandArguments: Argv,
): Argv<DaemonCommandArguments> =>
  commandArguments.option("json", {
    type: "boolean",
    default: false,
    describe: "Print machine-readable output",
  });

export function runStandaloneDaemonCli({
  argv = hideBin(process.argv),
  foregroundCommand,
}: DaemonCommandOptions & {
  readonly argv?: readonly string[];
} = {}): void {
  const daemonCli = yargs(argv);
  const versionedDaemonCli = PROCESS_ENV_COMMA_BUILD_VERSION
    ? daemonCli.version(PROCESS_ENV_COMMA_BUILD_VERSION)
    : daemonCli.version(false);

  void versionedDaemonCli
    .scriptName("comma-agents-daemon")
    .usage("$0 <command> [options]")
    .command(
      "start",
      "Start the daemon",
      daemonStartOptions,
      async (commandArguments: DaemonCommandYargsArguments) => {
        await processDaemonCommand("start", commandArguments, {
          foregroundCommand,
        });
      },
    )
    .command(
      "restart",
      "Restart the daemon",
      daemonStartOptions,
      async (commandArguments: DaemonCommandYargsArguments) => {
        await processDaemonCommand("restart", commandArguments, {
          foregroundCommand,
        });
      },
    )
    .command("stop", "Stop the daemon", {}, async () => {
      await processDaemonCommand("stop", {}, { foregroundCommand });
    })
    .command(
      "status",
      "Show daemon status",
      daemonStatusOptions,
      async (commandArguments: DaemonCommandYargsArguments) => {
        await processDaemonCommand("status", commandArguments, {
          foregroundCommand,
        });
      },
    )
    .command("logs", "Show the daemon log file", {}, async () => {
      await processDaemonCommand("logs", {}, { foregroundCommand });
    })
    .demandCommand(
      1,
      "Please specify a command: start, stop, restart, status, or logs",
    )
    .strict()
    .help()
    .alias("h", "help")
    .fail((message, error) => {
      if (error) {
        console.error(`Fatal error: ${error.message}`);
      } else if (message) {
        console.error(message);
      }
      process.exit(1);
    })
    .parseAsync()
    .catch((caughtError: unknown) => {
      console.error(
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      );
      process.exit(1);
    });
}
