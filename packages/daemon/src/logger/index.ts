import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getRotatingFileSink } from "@logtape/file";
import {
  configureSync,
  getConfig,
  getConsoleSink,
  getJsonLinesFormatter,
  resetSync,
  type LogLevel,
  type Sink,
} from "@logtape/logtape";

/** Application-owned logging policy shared by every `comma` category. */
export interface LoggingOptions {
  /** Minimum severity. `warn` is accepted for existing daemon configurations. */
  readonly level?: LogLevel | "warn";
  /** Append JSON logs to this file, rotating when it reaches maxSize. */
  readonly file?: string;
  /** Maximum log file size in bytes. @default 10485760 */
  readonly maxSize?: number;
  /** Number of rotated backups to retain. @default 5 */
  readonly maxFiles?: number;
  /** Write JSON logs to stderr. @default true */
  readonly stderr?: boolean;
}

/**
 * Configure LogTape once at application startup, never during package import.
 * All modules use LogTape's getLogger(["comma", ...category]) directly.
 * An embedding application may configure LogTape itself instead of calling this.
 * The returned owner flushes and closes the sinks on shutdown.
 *
 * @param {LoggingOptions} options - Application log level and output destinations.
 * @returns {{ close(): void }} The application-owned logging shutdown handle.
 */
export function initializeLogging(options: LoggingOptions = {}): {
  close(): void;
} {
  if (getConfig() !== null) {
    throw new Error("Logging is already configured by this application");
  }
  const maxSize = options.maxSize ?? 10 * 1024 * 1024;
  const maxFiles = options.maxFiles ?? 5;
  if (!Number.isSafeInteger(maxSize) || maxSize < 1) {
    throw new Error("Logging maxSize must be a positive integer");
  }
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1) {
    throw new Error("Logging maxFiles must be a positive integer");
  }
  const formatter = getJsonLinesFormatter();
  const stderr = getConsoleSink({
    levelMap: {
      trace: "error",
      debug: "error",
      info: "error",
      warning: "error",
      error: "error",
      fatal: "error",
    },
    formatter,
  });
  if (options.file) mkdirSync(dirname(options.file), { recursive: true });
  const file = options.file
    ? getRotatingFileSink(options.file, { formatter, maxSize, maxFiles })
    : undefined;
  const sinks: Record<string, Sink> = { stderr, ...(file ? { file } : {}) };
  try {
    configureSync({
      sinks,
      contextLocalStorage: new AsyncLocalStorage(),
      loggers: [
        {
          category: ["comma"],
          lowestLevel:
            options.level === "warn" ? "warning" : (options.level ?? "info"),
          sinks: [
            ...(options.stderr === false ? [] : ["stderr" as const]),
            ...(file ? ["file" as const] : []),
          ],
        },
        // Report sink failures independently, even when application logs are file-only.
        {
          category: ["logtape", "meta"],
          lowestLevel: "warning",
          sinks: ["stderr"],
        },
      ],
    });
  } catch (error) {
    file?.[Symbol.dispose]();
    throw error;
  }
  const ownedConfig = getConfig();
  let closed = false;
  return {
    close() {
      if (closed) return;
      closed = true;
      // Do not dispose configuration installed later by an embedding application.
      if (getConfig() === ownedConfig) resetSync();
    },
  };
}
