/** Severity of a retained diagnostic entry. */
export type LogLevel = "info" | "warn" | "error";

/** One message, including consecutive identical occurrences. */
export interface LogEntry {
  /** ISO timestamp of the first occurrence. */
  readonly timestamp: string;
  /** ISO timestamp of the most recent occurrence. */
  readonly lastTimestamp: string;
  /** Message severity. */
  readonly level: LogLevel;
  /** Human-readable diagnostic message. */
  readonly message: string;
  /** Optional text context, without application payloads. */
  readonly details?: string;
  /** Number of adjacent identical occurrences. */
  readonly count: number;
}

/** Configuration for an independently owned in-memory log history. */
export interface LogBucketOptions {
  /** Name prefixed to developer console output. */
  readonly name: string;
  /** Positive integer entry limit; oldest entries are discarded. @default 100 */
  readonly maxEntries?: number;
}

/** Bounded diagnostic history and its subscription interface. */
export interface LogBucket {
  /** Record an informational message and forward it to the console. */
  readonly info: (message: string, details?: string) => void;
  /** Record a warning and forward it to the console. */
  readonly warn: (message: string, details?: string) => void;
  /** Record an error and forward it to the console. */
  readonly error: (message: string, details?: string) => void;
  /** Remove the entire retained history. */
  readonly clear: () => void;
  /** Read the current immutable snapshot; unchanged reads share an identity. */
  readonly getSnapshot: () => readonly LogEntry[];
  /** Observe history changes; returns an unsubscribe function. */
  readonly subscribe: (listener: () => void) => () => void;
}
