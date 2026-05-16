/** Default timeout: 60 seconds. */
export const RUN_COMMAND_DEFAULT_TIMEOUT_MS = 60_000;

/** Hard cap on `timeoutMs`: 10 minutes. */
export const RUN_COMMAND_MAX_TIMEOUT_MS = 10 * 60_000;

/** Maximum bytes captured from stdout before truncation flag is set. */
export const RUN_COMMAND_MAX_STDOUT_BYTES = 1_048_576; // 1 MiB

/** Maximum bytes captured from stderr before truncation flag is set. */
export const RUN_COMMAND_MAX_STDERR_BYTES = 1_048_576; // 1 MiB

/**
 * Default deny patterns. Commands matching any of these are rejected
 * outright with `permission_denied`. The patterns are intentionally
 * conservative — they target catastrophic, irreversible operations.
 */
export const RUN_COMMAND_DEFAULT_DENY_PATTERNS: readonly RegExp[] = [
  /\brm\s+(-[a-zA-Z]*[rRfF][a-zA-Z]*\s+)+\/(\s|$)/, // rm -rf /
  /\brm\s+(-[a-zA-Z]*[rRfF][a-zA-Z]*\s+)+~(\s|$)/, // rm -rf ~
  /\bmkfs(\.[a-zA-Z0-9]+)?\b/, // mkfs / mkfs.ext4 / etc.
  /\bdd\s+[^|;&]*\bif=/, // dd if=...
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb :(){ :|:& };:
  /\bcurl\b[^|;]*\|\s*(sh|bash|zsh)\b/, // curl ... | sh
  /\bwget\b[^|;]*\|\s*(sh|bash|zsh)\b/, // wget ... | sh
  /\bshutdown\b/,
  /\breboot\b/,
];

/**
 * Default approval-required patterns. Commands matching any of these
 * route through the sandbox `PermissionRequester` with operation
 * `"fs.exec"`. Empty by default — production deployments are expected
 * to configure these on a per-environment basis.
 */
export const RUN_COMMAND_DEFAULT_REQUIRE_APPROVAL_PATTERNS: readonly RegExp[] =
  [];

/** Truncation marker appended to stdout/stderr when over the cap. */
export const RUN_COMMAND_TRUNCATION_MARKER =
  "\n…[output truncated by run_command]";
