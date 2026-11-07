import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type DaemonConfig, DaemonConfigFileSchema } from ".";

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

/**
 * Save `modelRoles` in the config file, keeping every other setting as written.
 * @param {string} filePath - Config file to create or update.
 * @param {Readonly<Record<string, string>>} modelRoles - Models keyed by role name.
 */
export function writeConfigModelRoles(
  filePath: string,
  modelRoles: Readonly<Record<string, string>>,
): void {
  const existing = existsSync(filePath)
    ? DaemonConfigFileSchema.parse(JSON.parse(readFileSync(filePath, "utf-8")))
    : {};
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify({ ...existing, modelRoles }, null, 2)}\n`,
  );
}

/**
 * Resolve console and payload settings without retaining values from a previous load.
 * @param {Partial<DaemonConfig>} file - File configuration settings.
 * @param {Record<string, string | undefined>} env - Environment overrides.
 * @returns {Pick<DaemonConfig, "console" | "consoleFormat" | "logPayloads">} Resolved logging settings.
 * @internal
 */
export function resolveLoggingConfig(
  file: Partial<DaemonConfig>,
  env: Record<string, string | undefined>,
): Pick<DaemonConfig, "console" | "consoleFormat" | "logPayloads"> {
  const booleanSettings: Record<string, boolean | undefined> = {};
  for (const name of ["COMMA_DAEMON_CONSOLE", "COMMA_DAEMON_LOG_PAYLOADS"]) {
    const value = env[name];
    if (value === undefined || value === "") {
      continue;
    }
    if (value !== "true" && value !== "false") {
      throw new Error(`${name} must be true or false`);
    }
    booleanSettings[name] = value === "true";
  }
  const consoleEnabled = booleanSettings.COMMA_DAEMON_CONSOLE ?? file.console;
  const consoleFormat = env.COMMA_DAEMON_CONSOLE_FORMAT || file.consoleFormat;
  if (
    consoleFormat !== undefined &&
    consoleFormat !== "text" &&
    consoleFormat !== "json"
  ) {
    throw new Error("COMMA_DAEMON_CONSOLE_FORMAT must be text or json");
  }
  return {
    console: consoleEnabled ?? true,
    consoleFormat: consoleFormat ?? (consoleEnabled === true ? "text" : "json"),
    logPayloads:
      booleanSettings.COMMA_DAEMON_LOG_PAYLOADS ?? file.logPayloads ?? false,
  };
}
