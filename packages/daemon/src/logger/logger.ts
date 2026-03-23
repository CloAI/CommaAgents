// createLogger() — the main logger factory.
//
// Multi-sink, level-filtered, with child logger support.
// Zero external dependencies.

import { createStderrSink } from "./sinks/stderr";
import type { CreateLoggerOptions, LogEntry, Logger, LogLevel, LogSink } from "./types";
import { LOG_LEVELS } from "./types";

// Internal helpers

function shouldLog(entryLevel: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVELS[entryLevel] >= LOG_LEVELS[minLevel];
}

function now(): string {
  return new Date().toISOString();
}

// Logger implementation

function createLoggerImpl(sinks: LogSink[], minLevel: LogLevel, component?: string): Logger {
  function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (!shouldLog(level, minLevel)) return;

    const entry: LogEntry = {
      ts: now(),
      level,
      msg,
      ...(component ? { component } : {}),
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    };

    for (const sink of sinks) {
      try {
        sink.write(entry);
      } catch {
        // Sinks must not throw, but if they do, we silently drop.
        // We can't log the error without risking infinite recursion.
      }
    }
  }

  return {
    debug(msg: string, meta?: Record<string, unknown>): void {
      emit("debug", msg, meta);
    },
    info(msg: string, meta?: Record<string, unknown>): void {
      emit("info", msg, meta);
    },
    warn(msg: string, meta?: Record<string, unknown>): void {
      emit("warn", msg, meta);
    },
    error(msg: string, meta?: Record<string, unknown>): void {
      emit("error", msg, meta);
    },
    child(childComponent: string): Logger {
      // Chain component names: "server" → "server.ws"
      const fullComponent = component ? `${component}.${childComponent}` : childComponent;
      return createLoggerImpl(sinks, minLevel, fullComponent);
    },
    flush(): void {
      for (const sink of sinks) {
        try {
          sink.flush?.();
        } catch {
          // Ignore flush errors
        }
      }
    },
    close(): void {
      for (const sink of sinks) {
        try {
          sink.flush?.();
          sink.close?.();
        } catch {
          // Ignore close errors
        }
      }
    },
  };
}

// Public factory

/**
 * Create a structured logger.
 *
 * @param options.level - Minimum severity to emit. Default: "info".
 * @param options.sinks - Output destinations. Default: [StderrSink].
 *
 * @example
 * ```ts
 * // Simple stderr logger
 * const log = createLogger();
 * log.info("Server started", { port: 7422 });
 *
 * // Multiple sinks with debug level
 * const log = createLogger({
 *   level: "debug",
 *   sinks: [createStderrSink(), createFileSink("/var/log/daemon.log")],
 * });
 *
 * // Child logger for a subsystem
 * const wsLog = log.child("ws");
 * wsLog.info("Client connected", { clientId: "abc" });
 * // → {"ts":"...","level":"info","msg":"Client connected","component":"ws","clientId":"abc"}
 * ```
 */
export function createLogger(options?: CreateLoggerOptions): Logger {
  const level = options?.level ?? "info";
  const sinks = options?.sinks ?? [createStderrSink()];
  return createLoggerImpl(sinks, level);
}
