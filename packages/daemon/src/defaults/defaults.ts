import type { DaemonConfig } from "../config/config.types";
import {
  DEFAULT_INSTRUCTION_FILES,
  PROCESS_ENV_COMMA_DAEMON_CONFIG_FILE,
  PROCESS_ENV_COMMA_DAEMON_HOST,
  PROCESS_ENV_COMMA_DAEMON_LOG_FILE,
  PROCESS_ENV_COMMA_DAEMON_LOG_LEVEL,
  PROCESS_ENV_COMMA_DAEMON_PID_FILE,
  PROCESS_ENV_COMMA_DAEMON_PORT,
  PROCESS_ENV_COMMA_DAEMON_RUNS_DIR,
} from "./defaults.constants";
import type { DaemonDefaultOverrides } from "./defaults.types";

let daemonDefaultOverrides: DaemonDefaultOverrides = {};

// Configuration

export function getDaemonPort(): number {
  return (
    daemonDefaultOverrides.port ??
    Number.parseInt(PROCESS_ENV_COMMA_DAEMON_PORT, 10)
  );
}

export function setDaemonPort(port: number | undefined): void {
  daemonDefaultOverrides = { ...daemonDefaultOverrides, port };
}

export function getDaemonHost(): string {
  return daemonDefaultOverrides.host ?? PROCESS_ENV_COMMA_DAEMON_HOST;
}

export function setDaemonHost(host: string | undefined): void {
  daemonDefaultOverrides = { ...daemonDefaultOverrides, host };
}

export function getDaemonLogLevel(): DaemonConfig["logLevel"] {
  return (
    daemonDefaultOverrides.logLevel ??
    (PROCESS_ENV_COMMA_DAEMON_LOG_LEVEL as DaemonConfig["logLevel"])
  );
}

export function setDaemonLogLevel(
  logLevel: DaemonConfig["logLevel"] | undefined,
): void {
  daemonDefaultOverrides = { ...daemonDefaultOverrides, logLevel };
}

export function getDaemonLogFile(): string | undefined {
  return daemonDefaultOverrides.logFile ?? PROCESS_ENV_COMMA_DAEMON_LOG_FILE;
}

export function setDaemonLogFile(logFile: string | undefined): void {
  daemonDefaultOverrides = { ...daemonDefaultOverrides, logFile };
}

export function getDaemonPidFile(): string {
  return daemonDefaultOverrides.pidFile ?? PROCESS_ENV_COMMA_DAEMON_PID_FILE;
}

export function setDaemonPidFile(pidFile: string | undefined): void {
  daemonDefaultOverrides = { ...daemonDefaultOverrides, pidFile };
}

export function getDaemonConfigFile(): string {
  return (
    daemonDefaultOverrides.configFile ?? PROCESS_ENV_COMMA_DAEMON_CONFIG_FILE
  );
}

export function setDaemonConfigFile(configFile: string | undefined): void {
  daemonDefaultOverrides = { ...daemonDefaultOverrides, configFile };
}

export function getDaemonRunsDirectory(): string {
  return daemonDefaultOverrides.runsDir ?? PROCESS_ENV_COMMA_DAEMON_RUNS_DIR;
}

export function setDaemonRunsDirectory(runsDir: string | undefined): void {
  daemonDefaultOverrides = { ...daemonDefaultOverrides, runsDir };
}

export function getDaemonModelRoles(): Readonly<Record<string, string>> {
  return daemonDefaultOverrides.modelRoles ?? {};
}

export function setDaemonModelRoles(
  modelRoles: Readonly<Record<string, string>> | undefined,
): void {
  daemonDefaultOverrides = { ...daemonDefaultOverrides, modelRoles };
}

export function getDaemonInstructionFiles(): readonly string[] {
  return daemonDefaultOverrides.instructionFiles ?? DEFAULT_INSTRUCTION_FILES;
}

export function setDaemonInstructionFiles(
  instructionFiles: readonly string[] | undefined,
): void {
  daemonDefaultOverrides = { ...daemonDefaultOverrides, instructionFiles };
}

export function getDaemonConfig(): DaemonConfig {
  return {
    port: getDaemonPort(),
    host: getDaemonHost(),
    logLevel: getDaemonLogLevel(),
    logFile: getDaemonLogFile(),
    pidFile: getDaemonPidFile(),
    configFile: getDaemonConfigFile(),
    runsDir: getDaemonRunsDirectory(),
    modelRoles: getDaemonModelRoles(),
    instructionFiles: getDaemonInstructionFiles(),
  };
}

export function resetDaemonDefaultOverrides(): void {
  daemonDefaultOverrides = {};
}
