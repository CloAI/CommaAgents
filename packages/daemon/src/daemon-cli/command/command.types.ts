import type { ArgumentsCamelCase } from "yargs";

/** Daemon process commands shared by the standalone daemon binary and the top-level CLI. */
export type DaemonCommandAction =
  | "start"
  | "stop"
  | "restart"
  | "status"
  | "logs";

/** Options supplied by a CLI surface before running daemon commands. */
export interface DaemonCommandOptions {
  /** Command prefix used to invoke the daemon CLI before start flags. */
  readonly foregroundCommand?: ReadonlyArray<string>;
}

/** Parsed daemon command arguments from yargs. */
export interface DaemonCommandArguments {
  /** Daemon command action to run. */
  readonly action?: DaemonCommandAction;
  /** Run daemon in the current process instead of detaching. */
  readonly foreground?: boolean;
  /** Override the daemon listening port. */
  readonly port?: number;
  /** Enable debug-level daemon logging. */
  readonly verbose?: boolean;
  /** Print machine-readable output for commands that support it. */
  readonly json?: boolean;
}

/** yargs argument shape used by daemon command handlers. */
export type DaemonCommandYargsArguments =
  ArgumentsCamelCase<DaemonCommandArguments>;
