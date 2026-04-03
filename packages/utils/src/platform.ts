// Platform utilities — runtime environment detection.

/**
 * Check if the process is running under systemd (journald captures stderr).
 *
 * Detects the `$JOURNAL_STREAM` or `$INVOCATION_ID` environment variables
 * that systemd sets for managed services.
 */
export function isSystemd(): boolean {
  return !!(process.env.JOURNAL_STREAM || process.env.INVOCATION_ID);
}

/**
 * Check if the current platform is Linux.
 */
export function isLinux(): boolean {
  return process.platform === "linux";
}
