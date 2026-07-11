import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sleep } from "bun";
import {
  type DaemonCommandArguments,
  type DaemonCommandOptions,
  type DaemonProcessStartOptions,
  getDaemonProcessStatus,
} from "..";
import { DAEMON_POLL_INTERVAL_MS } from "./process.constants";
import type { DaemonProcessWaitOptions } from "./process.types";

export function buildDaemonProcessEnvOverrides({
  port,
  verbose,
  env = process.env,
}: DaemonProcessStartOptions): Record<string, string | undefined> {
  const envOverrides: Record<string, string | undefined> = { ...env };
  if (port !== undefined) {
    envOverrides.COMMA_DAEMON_PORT = String(port);
  }
  if (verbose === true) {
    envOverrides.COMMA_DAEMON_LOG_LEVEL = "debug";
  }
  return envOverrides;
}

function resolveDefaultDaemonCommand(): string[] {
  return [
    process.execPath,
    "-i",
    "run",
    fileURLToPath(new URL("../daemon-cli.ts", import.meta.url)),
  ];
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
    : [...resolveDefaultDaemonCommand(), "start", "--foreground"];
  if (port !== undefined) {
    spawnArguments.push("--port", String(port));
  }
  if (verbose === true) {
    spawnArguments.push("--verbose");
  }
  return spawnArguments;
}

export async function waitForDaemonProcessReady({
  config,
  timeoutMs,
}: DaemonProcessWaitOptions): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const remainingMs = deadline - Date.now();
      const response = await fetch(
        `http://${config.host}:${config.port}/health`,
        {
          signal: AbortSignal.timeout(
            Math.max(1, Math.min(DAEMON_POLL_INTERVAL_MS, remainingMs)),
          ),
        },
      );
      if (response.ok) {
        return true;
      }
    } catch {
      await sleep(DAEMON_POLL_INTERVAL_MS);
    }
  }
  return false;
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
