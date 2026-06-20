import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DaemonConfig } from "../config";
import { FALLBACK_DAEMON_VERSION } from "./daemon-control.constants";
import type { DaemonStartOptions } from "./daemon-control.types";

export function buildDaemonEnvOverrides({
  port,
  verbose,
  env = process.env,
}: DaemonStartOptions): Record<string, string | undefined> {
  const envOverrides: Record<string, string | undefined> = { ...env };
  if (port !== undefined) {
    envOverrides.COMMA_DAEMON_PORT = String(port);
  }
  if (verbose === true) {
    envOverrides.COMMA_DAEMON_LOG_LEVEL = "debug";
  }
  return envOverrides;
}

export function buildDaemonHealthUrl(config: DaemonConfig): string {
  return `http://${config.host}:${config.port}/health`;
}

export function resolveDefaultDaemonCliEntrypoint(): string {
  return fileURLToPath(new URL("../cli.ts", import.meta.url));
}

export function readDaemonPackageVersion(): string {
  const packagePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../package.json",
  );
  if (!existsSync(packagePath)) {
    return FALLBACK_DAEMON_VERSION;
  }

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
    readonly version?: unknown;
  };
  return typeof packageJson.version === "string"
    ? packageJson.version
    : FALLBACK_DAEMON_VERSION;
}

export function buildDaemonForegroundArgs({
  foregroundCommand,
  foregroundEntrypoint,
  port,
  modelOverride,
  verbose,
}: DaemonStartOptions): string[] {
  const spawnArguments = foregroundCommand
    ? [...foregroundCommand, "start", "--foreground"]
    : [
        process.execPath,
        "-i",
        "run",
        foregroundEntrypoint ?? resolveDefaultDaemonCliEntrypoint(),
        "start",
        "--foreground",
      ];
  if (port !== undefined) {
    spawnArguments.push("--port", String(port));
  }
  if (modelOverride !== undefined) {
    spawnArguments.push("--model-override", modelOverride);
  }
  if (verbose === true) {
    spawnArguments.push("--verbose");
  }
  return spawnArguments;
}
