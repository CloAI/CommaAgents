import type { DaemonConfig } from "../config/config.types";

/** Process-wide daemon settings that intentionally override built-in and file values. */
export interface DaemonDefaultOverrides {
  readonly port?: number;
  readonly host?: string;
  readonly logLevel?: DaemonConfig["logLevel"];
  readonly logFile?: string;
  readonly pidFile?: string;
  readonly configFile?: string;
  readonly runsDir?: string;
  readonly modelRoles?: Readonly<Record<string, string>>;
  readonly instructionFiles?: readonly string[];
  readonly skills?: DaemonConfig["skills"];
}
