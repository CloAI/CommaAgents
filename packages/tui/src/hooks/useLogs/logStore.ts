import { appendFileSync } from "node:fs";
import { MAX_LOG_ENTRIES } from "./useLogs.constants";
import type { LogEntry, LogLevel, LogStore, LogStoreListener } from "./useLogs.types";
import { formatArgs, nextLogId } from "./useLogs.utils";
import { DEBUG_LOG, LOG_FILE_PATH } from "../../utils/debug";

/**
 * Create a log store that hijacks global console methods immediately.
 *
 * All `console.log`, `console.info`, `console.warn`, `console.error`,
 * and `console.debug` output is redirected exclusively to the store --
 * nothing is written to the terminal. The Logs tab is the only place
 * to view captured output.
 *
 * @param maxEntries - Maximum number of entries to retain. @default 500
 */
export function createLogStore(maxEntries: number = MAX_LOG_ENTRIES): LogStore {
  let entries: readonly LogEntry[] = [];
  const listeners = new Set<LogStoreListener>();

  const original: Record<LogLevel, (...args: unknown[]) => void> = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  function notifyListeners(): void {
    for (const listener of listeners) {
      listener();
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
        appendFileSync(LOG_FILE_PATH, `[${ts}] ${level.toUpperCase()} ${message}\n`);
      } catch {
        // ignore
      }
    }
  }

  function createInterceptor(level: LogLevel) {
    return (...args: unknown[]) => {
      appendEntry(level, formatArgs(args));
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
