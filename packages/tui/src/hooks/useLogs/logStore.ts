import { appendFileSync } from "node:fs";
import { DEBUG_LOG, LOG_FILE_PATH } from "../../utils/debug";
import { MAX_LOG_ENTRIES } from "./useLogs.constants";
import type {
  LogEntry,
  LogLevel,
  LogStore,
  LogStoreListener,
} from "./useLogs.types";
import { formatArgs, nextLogId } from "./useLogs.utils";

/**
 * Create a log store that hijacks global console methods immediately.
 *
 * The store starts in **pass-through mode**: every console call is buffered
 * into the store AND forwarded to the original terminal output (stderr/stdout).
 * This ensures that startup errors — import failures, TTY errors, etc. — are
 * still visible in the terminal if the app crashes before the UI renders.
 *
 * Once the app has successfully rendered, call {@link LogStore.commit} to
 * switch to **capture mode**. After that point all console output is captured
 * exclusively into the store; the Logs tab is the only place to view it.
 *
 * @param maxEntries - Maximum number of entries to retain. @default 500
 */
export function createLogStore(maxEntries: number = MAX_LOG_ENTRIES): LogStore {
  let entries: readonly LogEntry[] = [];
  let committed = false;
  const listeners = new Set<LogStoreListener>();

  const original: Record<LogLevel, (...args: unknown[]) => void> = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  // The terminal streams each level naturally writes to.
  const stream: Record<LogLevel, NodeJS.WriteStream> = {
    log: process.stdout,
    info: process.stdout,
    warn: process.stderr,
    error: process.stderr,
    debug: process.stderr,
  };

  function notifyListeners(): void {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // A misbehaving subscriber must never break the logging pipeline.
      }
    }
  }

  function appendEntry(level: LogLevel, message: string): void {
    const entry: LogEntry = {
      id: nextLogId(),
      timestamp: Date.now(),
      level,
      message,
    };

    const next = [...entries, entry];
    entries = next.length > maxEntries ? next.slice(-maxEntries) : next;
    notifyListeners();

    if (DEBUG_LOG) {
      try {
        const ts = new Date(entry.timestamp).toISOString();
        appendFileSync(
          LOG_FILE_PATH,
          `[${ts}] ${level.toUpperCase()} ${message}\n`,
        );
      } catch {
        // Writing to disk is best-effort.
      }
    }
  }

  function createInterceptor(level: LogLevel) {
    return (...args: unknown[]) => {
      const message = formatArgs(args);
      appendEntry(level, message);
      // In pass-through mode forward to the terminal so startup errors are visible.
      if (!committed) {
        stream[level].write(`${message}\n`);
      }
    };
  }

  console.log = createInterceptor("log");
  console.info = createInterceptor("info");
  console.warn = createInterceptor("warn");
  console.error = createInterceptor("error");
  console.debug = createInterceptor("debug");

  return {
    getSnapshot(): readonly LogEntry[] {
      return entries;
    },

    subscribe(listener: LogStoreListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    clear(): void {
      entries = [];
      notifyListeners();
    },

    push(level: LogLevel, message: string): void {
      appendEntry(level, message);
    },

    commit(): void {
      committed = true;
    },

    isCommitted(): boolean {
      return committed;
    },

    destroy(): void {
      console.log = original.log;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
      console.debug = original.debug;
      listeners.clear();
    },
  };
}

/** Singleton log store, created at module load time so no console calls are missed. */
export const logStore = createLogStore();
