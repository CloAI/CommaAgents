/** Process-wide daemon settings that intentionally override built-in and file values. */
export interface DaemonDefaultOverrides {
  readonly port?: number;
  readonly host?: string;
  readonly logLevel?: "debug" | "info" | "warn" | "error";
  readonly logFile?: string;
  readonly pidFile?: string;
  readonly configFile?: string;
  readonly runsDir?: string;
}
