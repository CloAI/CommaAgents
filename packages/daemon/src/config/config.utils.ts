import { existsSync, readFileSync } from "node:fs";
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
