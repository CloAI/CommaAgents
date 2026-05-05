import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LogLevel, LogStore } from "../hooks/useLogs/useLogs.types";
import { DEBUG_LOG, LOG_FILE_PATH } from "./debug";

/** A structured logger that writes to the in-app log store and optionally to disk. */
export interface TuiLogger {
  readonly log: (message: string) => void;
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
  readonly debug: (message: string) => void;
}

/**
 * Create a TUI logger that pushes entries directly into the log store.
 *
 * When {@link DEBUG_LOG} is enabled, entries are also appended to
 * {@link LOG_FILE_PATH} on disk as plain-text lines.
 *
 * @param store - The log store singleton to push entries into.
 * @param prefix - Optional prefix prepended to every message (e.g. "[daemon]").
 */
export function createTuiLogger(store: LogStore, prefix?: string): TuiLogger {
  let fileSinkReady = false;

  if (DEBUG_LOG) {
    const dir = dirname(LOG_FILE_PATH);
    mkdirSync(dir, { recursive: true });
    writeFileSync(LOG_FILE_PATH, "", { flag: "w" });
    fileSinkReady = true;
  }

  function emit(level: LogLevel, message: string): void {
    const formatted = prefix ? `${prefix} ${message}` : message;
    store.push(level, formatted);

    if (fileSinkReady) {
      const timestamp = new Date().toISOString();
      appendFileSync(LOG_FILE_PATH, `[${timestamp}] ${level.toUpperCase()} ${formatted}\n`);
    }
  }

  return {
    log: (message: string) => emit("log", message),
    info: (message: string) => emit("info", message),
    warn: (message: string) => emit("warn", message),
    error: (message: string) => emit("error", message),
    debug: (message: string) => emit("debug", message),
  };
}
