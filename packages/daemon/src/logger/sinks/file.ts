// FileSink — writes JSON lines to a file.
//
// Used when the daemon needs a persistent log file in addition to stderr.
// Common for debugging, audit trails, or when the service manager doesn't
// capture stderr (e.g., some Windows service wrappers).

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LogEntry, LogSink } from "../logger.types";
import { formatJsonLine } from "./stderr";

/**
 * Create a sink that appends JSON lines to a file.
 *
 * The parent directory is created automatically if it doesn't exist.
 * Writes are synchronous (appendFileSync) to ensure log entries are
 * flushed before process exit.
 *
 * @param filePath - Absolute path to the log file.
 */
export function createFileSink(filePath: string): LogSink {
  // Ensure parent directory exists
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  // Truncate/create the file on first open
  writeFileSync(filePath, "", { flag: "w" });

  return {
    write(entry: LogEntry): void {
      appendFileSync(filePath, `${formatJsonLine(entry)}\n`);
    },
    flush(): void {
      // appendFileSync is synchronous — nothing to flush
    },
    close(): void {
      // No file handle to close — we use appendFileSync per write
    },
  };
}
