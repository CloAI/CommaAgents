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
  /**
   * Switches from pass-through mode to full capture mode.
   *
   * During startup the store buffers log entries AND forwards them to the
   * original terminal output so that errors are visible if the app crashes
   * before the UI renders. Call `commit()` once the app is ready — after that
   * point all console output is captured exclusively into the store and the
   * Logs tab is the only place to view it.
   */
  readonly commit: () => void;
  /** Whether the store has been committed (true) or is still in pass-through mode. */
  readonly isCommitted: () => boolean;
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
