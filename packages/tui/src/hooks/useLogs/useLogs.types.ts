/** Severity level for a captured log entry. */
export type LogLevel = "debug" | "info" | "warn" | "error" | "log";

/** A single captured console log entry. */
export interface LogEntry {
  /** Unique identifier for the log entry. */
  readonly id: string;
  /** Timestamp when the log was captured. */
  readonly timestamp: number;
  /** The severity level of the log. */
  readonly level: LogLevel;
  /** The stringified log message. */
  readonly message: string;
}

/** Callback invoked when the log store contents change. */
export type LogStoreListener = () => void;

/** Module-level log store that captures console output. */
export interface LogStore {
  /** Returns the current snapshot of all log entries. */
  readonly getSnapshot: () => readonly LogEntry[];
  /** Registers a listener notified on every log change. Returns an unsubscribe function. */
  readonly subscribe: (listener: LogStoreListener) => () => void;
  /** Push a log entry directly into the store (bypasses console interception). */
  readonly push: (level: LogLevel, message: string) => void;
  /** Clears all captured logs. */
  readonly clear: () => void;
  /** Restores original console methods and stops capturing. */
  readonly destroy: () => void;
}

/** Return value of the useLogs hook. */
export interface LogsState {
  /** All captured log entries, oldest first. */
  readonly logs: readonly LogEntry[];
  /** Clears all captured logs. */
  readonly clearLogs: () => void;
}
