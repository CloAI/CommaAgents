import type { LogEntry, LogSink } from "../logger.types";

/** Serialize a LogEntry to a single JSON line. */
function formatJsonLine(entry: LogEntry): string {
  const record: Record<string, unknown> = {
    ts: entry.ts,
    level: entry.level,
    msg: entry.msg,
  };

  if (entry.component) {
    record.component = entry.component;
  }

  if (entry.meta && Object.keys(entry.meta).length > 0) {
    // Spread meta fields at the top level for flat structured logging
    Object.assign(record, entry.meta);
  }

  return JSON.stringify(record);
}

export { formatJsonLine };

/**
 * Create a sink that writes JSON lines to stderr.
 *
 * Each log entry is serialized as a single JSON line followed by a newline.
 * This format is universally compatible with log aggregation tools
 * (journald, CloudWatch, Datadog, etc.).
 */
export function createStderrSink(): LogSink {
  return {
    write(entry: LogEntry): void {
      // process.stderr.write is synchronous in Node/Bun — no lost logs on crash
      process.stderr.write(`${formatJsonLine(entry)}\n`);
    },
    flush(): void {
      // stderr is unbuffered — nothing to flush
    },
  };
}
