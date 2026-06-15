import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDataDir } from "@comma-agents/core";
import { type DaemonConfig, DaemonConfigFileSchema } from ".";
import { ENV_MAP } from "./config.constants";

export function buildDefaults(): DaemonConfig {
  const dataDir = resolveDataDir();
  return {
    port: 7422,
    host: "127.0.0.1",
    logLevel: "info",
    logFile: undefined,
    providerCacheDir: join(dataDir, "providers"),
    pidFile: join(dataDir, "daemon.pid"),
    configFile: join(dataDir, "daemon.json"),
    runsDir: join(dataDir, "runs"),
  };
}

export function readEnvOverrides(
  env: Record<string, string | undefined>,
): Partial<DaemonConfig> {
  const overrides: Record<string, unknown> = {};
  for (const { env: envKey, key, parse } of ENV_MAP) {
    const raw = env[envKey];
    if (raw !== undefined && raw !== "") {
      overrides[key] = parse(raw);
    }
  }
  return overrides as Partial<DaemonConfig>;
}

export function readConfigFile(filePath: string): Partial<DaemonConfig> {
  if (!existsSync(filePath)) {
    return {};
  }

  const raw = readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  const parsed = DaemonConfigFileSchema.parse(json);

  // Convert to Partial<DaemonConfig> (only defined fields)
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<DaemonConfig>;
}
