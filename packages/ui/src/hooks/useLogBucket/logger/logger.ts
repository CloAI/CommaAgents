import type {
  LogBucket,
  LogBucketOptions,
  LogEntry,
  LogLevel,
} from "./logger.types";

/**
 * Create a bounded text logger without changing global console methods.
 * @param {LogBucketOptions} options - Bucket name and retention limit.
 * @returns {LogBucket} An independently owned diagnostic history.
 * @example
 * const logs = createLogBucket({ name: "daemon" });
 * logs.error("Request timed out.", "command: runs.get");
 */
export function createLogBucket({
  name,
  maxEntries = 100,
}: LogBucketOptions): LogBucket {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError("maxEntries must be a positive integer.");
  }
  let entries: readonly LogEntry[] = [];
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  const write = (level: LogLevel, message: string, details?: string): void => {
    const timestamp = new Date().toISOString();
    const previous = entries.at(-1);
    const entry: LogEntry =
      previous &&
      previous.level === level &&
      previous.message === message &&
      previous.details === details
        ? { ...previous, lastTimestamp: timestamp, count: previous.count + 1 }
        : {
            timestamp,
            lastTimestamp: timestamp,
            level,
            message,
            details,
            count: 1,
          };
    entries =
      previous && entry.count > 1
        ? [...entries.slice(0, -1), entry]
        : [...entries, entry].slice(-maxEntries);
    notify();
    if (details === undefined) {
      console[level](`[${name}] ${message}`);
    } else {
      console[level](`[${name}] ${message}`, details);
    }
  };
  return {
    info: (message, details) => write("info", message, details),
    warn: (message, details) => write("warn", message, details),
    error: (message, details) => write("error", message, details),
    clear: () => {
      entries = [];
      notify();
    },
    getSnapshot: () => entries,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Format retained entries for the log viewer and plain-text copying.
 * @param {readonly LogEntry[]} entries - Chronological entries to format.
 * @returns {string} Timestamped text including repeat counts and details.
 */
export function formatLogEntries(entries: readonly LogEntry[]): string {
  return entries
    .map((entry) => {
      const repeat =
        entry.count > 1
          ? ` (x${entry.count}; last ${entry.lastTimestamp})`
          : "";
      return `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.message}${repeat}${entry.details === undefined ? "" : `\n${entry.details}`}`;
    })
    .join("\n\n");
}
