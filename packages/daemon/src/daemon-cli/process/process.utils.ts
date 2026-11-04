import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DaemonCommandArguments, DaemonCommandOptions } from "../command";
import type { DaemonProcessStartOptions } from "./actions/start";
import { getDaemonProcessStatus } from "./actions/status";

export function buildDaemonProcessEnvOverrides({
  port,
  verbose,
  console: consoleEnabled,
  consoleFormat,
  logPayloads,
  env = process.env,
}: DaemonProcessStartOptions): Record<string, string | undefined> {
  const envOverrides: Record<string, string | undefined> = { ...env };
  if (port !== undefined) {
    envOverrides.COMMA_DAEMON_PORT = String(port);
  }
  if (verbose === true) {
    envOverrides.COMMA_DAEMON_LOG_LEVEL = "debug";
  }
  if (consoleEnabled !== undefined) {
    envOverrides.COMMA_DAEMON_CONSOLE = String(consoleEnabled);
    if (consoleEnabled && consoleFormat === undefined) {
      envOverrides.COMMA_DAEMON_CONSOLE_FORMAT = "text";
    }
  }
  if (consoleFormat !== undefined) {
    envOverrides.COMMA_DAEMON_CONSOLE_FORMAT = consoleFormat;
  }
  if (logPayloads !== undefined) {
    envOverrides.COMMA_DAEMON_LOG_PAYLOADS = String(logPayloads);
  }
  return envOverrides;
}

/**
 * Reject console flags before process startup or restart can change daemon state.
 * @param {DaemonProcessStartOptions} options - Requested process mode and logging flags.
 * @returns {void} Returns when console flags are valid for this process mode.
 * @internal
 */
export function validateDaemonConsoleOptions(
  options: DaemonProcessStartOptions,
): void {
  if (
    options.foreground !== true &&
    (options.console !== undefined || options.consoleFormat !== undefined)
  ) {
    throw new Error(
      "Console flags require --foreground; background logs are available in the configured log file.",
    );
  }
}

export function readDaemonPackageVersion(): string | undefined {
  const packagePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../package.json",
  );

  try {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      readonly version?: unknown;
    };
    return typeof packageJson.version === "string"
      ? packageJson.version
      : undefined;
  } catch {
    return undefined;
  }
}

export function buildDaemonProcessForegroundArgs({
  foregroundCommand,
  port,
  verbose,
}: DaemonProcessStartOptions): string[] {
  const spawnArguments = foregroundCommand
    ? [...foregroundCommand, "start", "--foreground"]
    : [
        process.execPath,
        "run",
        fileURLToPath(
          new URL(
            import.meta.url.endsWith(".ts") ? "../../cli.ts" : "./cli.js",
            import.meta.url,
          ),
        ),
        "start",
        "--foreground",
      ];
  if (port !== undefined) {
    spawnArguments.push("--port", String(port));
  }
  if (verbose === true) {
    spawnArguments.push("--verbose");
  }
  return spawnArguments;
}

export function buildStartOptions(
  commandArguments: DaemonCommandArguments,
  options: DaemonCommandOptions,
): DaemonProcessStartOptions {
  return {
    foreground: commandArguments.foreground === true,
    port:
      typeof commandArguments.port === "number"
        ? commandArguments.port
        : undefined,
    verbose: commandArguments.verbose === true,
    console: commandArguments.console,
    consoleFormat: commandArguments.consoleFormat,
    logPayloads: commandArguments.logPayloads,
    foregroundCommand: options.foregroundCommand,
  };
}

export function printDaemonProcessStatus(json: boolean): void {
  const status = getDaemonProcessStatus();
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

export function printDaemonLogPath(): void {
  const status = getDaemonProcessStatus();
  console.log(status.logFile ?? "Daemon log file is not configured");
}
