import type { LogLevel } from "../../hooks/useLogs";

/** Format a Unix timestamp as HH:MM:SS.mmm for log display. */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const millis = String(date.getMilliseconds()).padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${millis}`;
}

/** Format a log level as a fixed-width uppercase label (e.g. "INFO "). */
export function formatLevel(level: LogLevel): string {
  return level.toUpperCase().padEnd(5);
}
