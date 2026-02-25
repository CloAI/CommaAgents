// Logger type definitions — contracts for the daemon logging system.
//
// The logger uses a sink-based architecture so output can be directed to
// multiple destinations simultaneously (stderr, file, OS logging system).

// ---------------------------------------------------------------------------
// LogLevel — severity levels, ordered from most to least verbose
// ---------------------------------------------------------------------------

/** Log severity levels. Numeric values used for filtering. */
export const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

// ---------------------------------------------------------------------------
// LogEntry — a single structured log record
// ---------------------------------------------------------------------------

/** A structured log entry passed to sinks. */
export interface LogEntry {
  /** ISO-8601 timestamp. */
  readonly ts: string;
  /** Severity level. */
  readonly level: LogLevel;
  /** Log message. */
  readonly msg: string;
  /** Optional structured metadata. */
  readonly meta?: Record<string, unknown>;
  /** Optional component/subsystem name (set by child loggers). */
  readonly component?: string;
}

// ---------------------------------------------------------------------------
// LogSink — destination for log entries
// ---------------------------------------------------------------------------

/**
 * A log sink receives formatted entries and writes them to a destination.
 * Sinks should not filter by level — the logger handles that.
 */
export interface LogSink {
  /** Write a log entry. Must not throw. */
  write(entry: LogEntry): void;
  /** Flush any buffered output (optional). */
  flush?(): void;
  /** Close the sink and release resources (optional). */
  close?(): void;
}

// ---------------------------------------------------------------------------
// Logger — the public API
// ---------------------------------------------------------------------------

/** Structured logger with level filtering and child logger support. */
export interface Logger {
  /** Log at debug level. */
  debug(msg: string, meta?: Record<string, unknown>): void;
  /** Log at info level. */
  info(msg: string, meta?: Record<string, unknown>): void;
  /** Log at warn level. */
  warn(msg: string, meta?: Record<string, unknown>): void;
  /** Log at error level. */
  error(msg: string, meta?: Record<string, unknown>): void;

  /**
   * Create a child logger with a component name.
   * The component is included in every log entry from the child.
   */
  child(component: string): Logger;

  /** Flush all sinks. */
  flush(): void;

  /** Close all sinks and release resources. */
  close(): void;
}

// ---------------------------------------------------------------------------
// CreateLoggerOptions — configuration for createLogger()
// ---------------------------------------------------------------------------

/** Options for creating a logger instance. */
export interface CreateLoggerOptions {
  /** Minimum severity level to emit. Messages below this are dropped. Default: "info". */
  level?: LogLevel;
  /**
   * Output sinks. If not specified, defaults to stderr.
   * Pass an array of sinks to write to multiple destinations.
   */
  sinks?: LogSink[];
}
