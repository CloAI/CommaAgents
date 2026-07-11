import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LogEntry, LogSink } from "../logger.types";
import { formatJsonLine } from "./stderr";

/**
 * Create a sink that writes JSON lines to a file.
 *
 * Opening the sink creates or truncates the file. The parent directory is
 * created automatically when it does not exist.
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
