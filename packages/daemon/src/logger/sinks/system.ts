// SystemSink — platform-aware logging for OS service managers.
//
// When the daemon runs as a service, the OS logging system provides
// structured log collection, rotation, and querying out of the box.
//
// Platform behavior:
//
// Linux (systemd/journald):
//   journald recognizes syslog-style severity prefixes in stderr output:
//     <0> Emergency, <1> Alert, <2> Critical, <3> Error,
//     <4> Warning, <5> Notice, <6> Info, <7> Debug
//   When running under systemd, prefixing stderr lines with these markers
//   lets journalctl filter by priority (e.g., `journalctl -p err`).
//   Detection: $JOURNAL_STREAM or $INVOCATION_ID env vars are set by systemd.
//
// macOS (launchd):
//   launchd captures stderr and routes to os_log / Console.app.
//   No special prefix needed — severity filtering is done at the launchd
//   plist level or in Console.app. We still write JSON for parsability.
//
// Windows:
//   Windows services typically use Event Log, but that requires native FFI.
//   For now, stderr + file sink covers Windows service wrappers (NSSM, WinSW).
//
// This sink adds journald severity prefixes on Linux when running under
// systemd, and acts as a plain stderr sink otherwise (but with the prefix
// format for any syslog-aware collector).

import type { LogEntry, LogLevel, LogSink } from "../types";
import { formatJsonLine } from "./stderr";

// ---------------------------------------------------------------------------
// Syslog severity mapping (RFC 5424)
// ---------------------------------------------------------------------------

const SYSLOG_SEVERITY: Record<LogLevel, number> = {
  error: 3, // Error
  warn: 4, // Warning
  info: 6, // Informational
  debug: 7, // Debug
};

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

/** Check if we're running under systemd (journald captures stderr). */
function isSystemd(): boolean {
  return !!(process.env.JOURNAL_STREAM || process.env.INVOCATION_ID);
}

/** Check if we're on Linux. */
function isLinux(): boolean {
  return process.platform === "linux";
}

// ---------------------------------------------------------------------------
// SystemSink
// ---------------------------------------------------------------------------

/**
 * Create a platform-aware system logging sink.
 *
 * On Linux under systemd: prefixes each line with `<N>` syslog severity
 * so journald can parse priority levels. This enables:
 *   journalctl -u comma-agents -p err    # show only errors
 *   journalctl -u comma-agents -p warn   # show warnings and above
 *
 * On other platforms: writes plain JSON lines to stderr (same as StderrSink).
 * The OS service manager (launchd, NSSM) captures stderr natively.
 *
 * @param options.forcePrefix - Always add syslog prefix regardless of platform.
 *   Useful for testing or when running behind a syslog-aware log collector.
 */
export function createSystemSink(options?: { forcePrefix?: boolean }): LogSink {
  const usePrefix = options?.forcePrefix ?? (isLinux() && isSystemd());

  return {
    write(entry: LogEntry): void {
      const json = formatJsonLine(entry);
      if (usePrefix) {
        // Journald parses the <N> prefix for severity
        const severity = SYSLOG_SEVERITY[entry.level];
        process.stderr.write(`<${severity}>${json}\n`);
      } else {
        process.stderr.write(json + "\n");
      }
    },
    flush(): void {
      // stderr is unbuffered
    },
  };
}

/**
 * Detect the recommended sinks for the current platform.
 *
 * Returns a description of what the system sink will do on this platform,
 * useful for startup logging.
 */
export function describeSystemLogging(): string {
  if (isLinux() && isSystemd()) {
    return "systemd/journald (stderr with syslog severity prefixes)";
  }
  if (isLinux()) {
    return "stderr (Linux, no systemd detected)";
  }
  if (process.platform === "darwin") {
    return "stderr (macOS/launchd captures stderr → Console.app)";
  }
  if (process.platform === "win32") {
    return "stderr (Windows, use NSSM/WinSW to capture to file)";
  }
  return `stderr (${process.platform})`;
}
