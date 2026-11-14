import type z from "zod";
import type { LogLevel } from "@logtape/logtape";
import type { DaemonConfigFileSchema } from "./config.constants";

/** Optional daemon settings accepted by the JSON configuration file. */
export type DaemonConfigFile = z.infer<typeof DaemonConfigFileSchema>;

/** Fully resolved daemon configuration. Every field has a value. */
export interface DaemonConfig {
  /** WebSocket server port. @default 7422 */
  readonly port: number;
  /** WebSocket server bind address. @default "127.0.0.1" */
  readonly host: string;
  /** Minimum log level. @default "info" */
  readonly logLevel: LogLevel | "warn";
  /** Optional file that receives structured daemon logs. */
  readonly logFile: string | undefined;
  /** Write application logs to stderr. @default true */
  readonly console?: boolean;
  /** Console output format; explicit console enablement defaults to text. @default "json" */
  readonly consoleFormat?: "text" | "json";
  /** Include agent input, responses, and tool payloads; enables debug logging. @default false */
  readonly logPayloads?: boolean;
  /** Path to the PID file. */
  readonly pidFile: string;
  /** Path to the config file that was loaded (or the default path if none found). */
  readonly configFile: string;
  /** Directory where run timelines and run configuration are persisted. */
  readonly runsDir: string;
  /** Models for `@role` references in strategies; unset roles use strategy defaults. */
  readonly modelRoles: Readonly<Record<string, string>>;
  /** Instruction file names checked per directory. @default ["AGENTS.md", "CLAUDE.md"] */
  readonly instructionFiles: readonly string[];
  /** Extra skill roots shared by workspace queries and run preparation. */
  readonly skills: { readonly additionalDirectories: readonly string[] };
}
