import type { PermissionRequester } from "../../../sandbox/sandbox.types";

/**
 * Snapshot of the host platform captured when the tool factory is
 * created. Surfaced in the tool description so the model knows which
 * shell idioms (POSIX vs PowerShell, `brew` vs `apt`, etc.) apply.
 */
export interface PlatformInfo {
  /** `process.platform` value (e.g. `"darwin"`, `"linux"`, `"win32"`). */
  readonly platform: NodeJS.Platform;
  /** Friendly OS name (e.g. `"macOS"`, `"Linux"`, `"Windows"`). */
  readonly osName: string;
  /** `os.release()` — kernel/build version string. */
  readonly osRelease: string;
  /** `process.arch` (e.g. `"arm64"`, `"x64"`). */
  readonly arch: string;
  /** Absolute path of the shell that will execute `command`. */
  readonly shellPath: string;
  /** Argv element used to invoke the shell with a command string. */
  readonly shellFlag: string;
  /** Runtime identifier: `"bun"` or `"node"` plus version. */
  readonly runtime: string;
}

/** Configuration for `run_command`. */
export interface RunCommandToolConfig {
  /**
   * Override the auto-detected platform info. Primarily intended for
   * tests that need deterministic descriptions; production callers
   * should leave this undefined.
   */
  readonly platformInfo?: PlatformInfo;
  /**
   * Regex patterns that mark commands as outright denied. Defaults to
   * `RUN_COMMAND_DEFAULT_DENY_PATTERNS`. Provide `[]` to disable.
   */
  readonly denyPatterns?: readonly RegExp[];
  /**
   * Regex patterns that route commands through the sandbox
   * PermissionRequester with operation `"fs.exec"`. Empty by default.
   */
  readonly requireApprovalPatterns?: readonly RegExp[];
  /** Override stdout capture cap (bytes). */
  readonly maxStdoutBytes?: number;
  /** Override stderr capture cap (bytes). */
  readonly maxStderrBytes?: number;
  /** Override the default timeout (ms). */
  readonly defaultTimeoutMs?: number;
}

/** Extended config that accepts an injected permission requester. */
export interface RunCommandToolConfigWithRequester
  extends RunCommandToolConfig {
  /**
   * Permission requester invoked when the command matches a
   * `requireApprovalPatterns` entry. If absent and an approval is
   * required, the call fails closed with `permission_denied`.
   */
  readonly requestPermission?: PermissionRequester;
}

/** Structured payload returned by `run_command`. */
export interface RunCommandData {
  /** The command string as executed (echoed verbatim). */
  readonly command: string;
  /** Absolute cwd the command ran in. */
  readonly cwd: string;
  /** Exit code. `null` only when the process was killed before exiting. */
  readonly exitCode: number | null;
  /** Signal that terminated the process, if any (e.g. `"SIGTERM"`). */
  readonly signal: NodeJS.Signals | null;
  /** Captured stdout (UTF-8 decoded, truncated to `maxStdoutBytes`). */
  readonly stdout: string;
  /** Captured stderr (UTF-8 decoded, truncated to `maxStderrBytes`). */
  readonly stderr: string;
  /** True when stdout was truncated by the cap. */
  readonly stdoutTruncated: boolean;
  /** True when stderr was truncated by the cap. */
  readonly stderrTruncated: boolean;
  /** True when the command exceeded `timeoutMs`. */
  readonly timedOut: boolean;
  /** Wall-clock duration of the command in milliseconds. */
  readonly durationMs: number;
  /** Platform snapshot used by the tool — surfaced for the model. */
  readonly platform: PlatformInfo;
}
