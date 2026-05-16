import { release } from "node:os";
import { describeTool } from "../describe-tool";
import { RUN_COMMAND_TRUNCATION_MARKER } from "./run-command.constants";
import type { PlatformInfo } from "./run-command.types";

/** Map `process.platform` to a friendly OS name. */
export function friendlyOsName(platform: NodeJS.Platform): string {
  switch (platform) {
    case "darwin":
      return "macOS";
    case "linux":
      return "Linux";
    case "win32":
      return "Windows";
    case "freebsd":
      return "FreeBSD";
    case "openbsd":
      return "OpenBSD";
    case "sunos":
      return "SunOS";
    case "aix":
      return "AIX";
    default:
      return platform;
  }
}

/**
 * Resolve the shell to use for executing a command string on the
 * current platform.
 *
 * On POSIX systems we prefer the user's `$SHELL` when set, falling
 * back to `/bin/sh`. On Windows we prefer `%ComSpec%`, falling back
 * to `cmd.exe`. The chosen shell is invoked with `-c <command>` on
 * POSIX or `/d /s /c <command>` on Windows.
 */
export function resolveShell(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env,
): { shellPath: string; shellFlag: string } {
  if (platform === "win32") {
    return {
      shellPath: env.ComSpec ?? "cmd.exe",
      shellFlag: "/d /s /c",
    };
  }
  return {
    shellPath: env.SHELL ?? "/bin/sh",
    shellFlag: "-c",
  };
}

/**
 * Detect the platform info for the current process. Cached snapshot —
 * call once at factory-creation time.
 */
export function detectPlatformInfo(): PlatformInfo {
  const platform = process.platform;
  const { shellPath, shellFlag } = resolveShell(platform);
  const bunVersion =
    typeof (globalThis as { Bun?: { version: string } }).Bun !== "undefined"
      ? (globalThis as { Bun: { version: string } }).Bun.version
      : undefined;
  const runtime = bunVersion
    ? `bun ${bunVersion}`
    : `node ${process.versions.node}`;

  return {
    platform,
    osName: friendlyOsName(platform),
    osRelease: release(),
    arch: process.arch,
    shellPath,
    shellFlag,
    runtime,
  };
}

/**
 * Build the model-facing tool description, baking in the detected
 * platform info so the LLM picks correct commands for the host.
 */
export function buildRunCommandDescription(info: PlatformInfo): string {
  return describeTool({
    purpose: [
      "Execute a shell command inside the workspace and capture its stdout, stderr, and exit code.",
      `Host: ${info.osName} ${info.osRelease} (${info.arch}). Shell: ${info.shellPath} ${info.shellFlag}. Runtime: ${info.runtime}.`,
      "Pick commands that are valid on this host — POSIX utilities on macOS/Linux, `cmd.exe` syntax on Windows.",
    ],
    inputs: [
      {
        name: "command",
        type: "string",
        required: true,
        description:
          "Shell command line. Runs via the host shell shown above; pipes, redirects, and substitutions are supported.",
      },
      {
        name: "cwd",
        type: "string",
        required: false,
        defaultValue: "workspace root",
        description:
          "Workspace-relative working directory. Must resolve inside the sandbox.",
      },
      {
        name: "timeoutMs",
        type: "number",
        required: false,
        defaultValue: "60000",
        description:
          "Kill the process (and its group on POSIX) after this many ms.",
      },
      {
        name: "env",
        type: "object<string, string>",
        required: false,
        description:
          "Extra environment variables merged onto the parent environment (never replacing it).",
      },
    ],
    outputs:
      "`{ command, cwd, exitCode, signal, stdout, stderr, stdoutTruncated, stderrTruncated, timedOut, durationMs, platform }`. Stdout/stderr are captured up to 1 MiB each; the `*Truncated` flags are set when content was dropped.",
    errors: [
      {
        kind: "outside_workspace",
        description: "`cwd` escapes the workspace.",
      },
      {
        kind: "permission_denied",
        description:
          "Command matches the deny list, or the user rejected an approval prompt for a high-risk pattern.",
      },
      {
        kind: "timeout",
        description:
          "Exceeded `timeoutMs`. `data.timedOut` is true and partial stdout/stderr are preserved.",
      },
      {
        kind: "command_failed",
        description:
          "Spawn failed (shell missing, etc.). A non-zero exit code is NOT an error: `ok` stays true and `data.exitCode` reflects the failure so you can inspect both output and status.",
      },
    ],
  });
}

/**
 * Truncate a captured stream to `maxBytes` UTF-8 bytes, appending a
 * truncation marker when content was dropped. Operates on the raw
 * Buffer to avoid splitting multi-byte sequences mid-character.
 */
export function truncateOutput(
  buffer: Buffer,
  maxBytes: number,
): { text: string; truncated: boolean } {
  if (buffer.byteLength <= maxBytes) {
    return { text: buffer.toString("utf8"), truncated: false };
  }
  // Slice on a safe UTF-8 boundary: walk back from maxBytes until the
  // byte is not a UTF-8 continuation byte (10xxxxxx).
  let safeEnd = maxBytes;
  while (
    safeEnd > 0 &&
    (buffer[safeEnd] ?? 0) >= 0x80 &&
    (buffer[safeEnd] ?? 0) < 0xc0
  ) {
    safeEnd -= 1;
  }
  const text = buffer.subarray(0, safeEnd).toString("utf8");
  return { text: text + RUN_COMMAND_TRUNCATION_MARKER, truncated: true };
}

/** True iff `command` matches any pattern in `patterns`. */
export function matchesAnyPattern(
  command: string,
  patterns: readonly RegExp[],
): boolean {
  for (const pattern of patterns) {
    if (pattern.test(command)) return true;
  }
  return false;
}
