import type { ChildProcessByStdio } from "node:child_process";
import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { z } from "zod";
import { SandboxViolationError } from "../../../errors";
import type { Policy } from "../../../guard/guard.types";
import {
  approveCommandsPolicy,
  denyCommandsPolicy,
} from "../../../guard/policies";
import { defineTool } from "../../define/define-tool";
import { sandboxErrorToToolError } from "../../io";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import {
  RUN_COMMAND_DEFAULT_DENY_PATTERNS,
  RUN_COMMAND_DEFAULT_REQUIRE_APPROVAL_PATTERNS,
  RUN_COMMAND_DEFAULT_TIMEOUT_MS,
  RUN_COMMAND_MAX_STDERR_BYTES,
  RUN_COMMAND_MAX_STDOUT_BYTES,
  RUN_COMMAND_MAX_TIMEOUT_MS,
} from "./run-command.constants";
import type {
  PlatformInfo,
  RunCommandData,
  RunCommandToolConfigWithRequester,
} from "./run-command.types";
import {
  buildRunCommandDescription,
  detectPlatformInfo,
  truncateOutput,
} from "./run-command.utils";

const runCommandParams = z.object({
  command: z
    .string()
    .min(1)
    .describe(
      "Shell command line to execute. Runs through the host's default shell — see the tool description for the resolved shell path.",
    ),
  cwd: z
    .string()
    .optional()
    .describe(
      "Workspace-relative working directory. Defaults to the workspace root. Must resolve inside the sandbox or `outside_workspace` is returned.",
    ),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(RUN_COMMAND_MAX_TIMEOUT_MS)
    .optional()
    .describe(
      `Kill the process after this many milliseconds. Defaults to ${RUN_COMMAND_DEFAULT_TIMEOUT_MS}; hard-capped at ${RUN_COMMAND_MAX_TIMEOUT_MS}.`,
    ),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Extra environment variables, merged on top of the daemon's environment. Existing variables are overwritten by entries supplied here; nothing is removed.",
    ),
});

export function createRunCommandTool(
  config?: RunCommandToolConfigWithRequester,
): ToolDefinition<typeof runCommandParams, RunCommandData> {
  const platformInfo: PlatformInfo =
    config?.platformInfo ?? detectPlatformInfo();
  const denyPatterns =
    config?.denyPatterns ?? RUN_COMMAND_DEFAULT_DENY_PATTERNS;
  const approvalPatterns =
    config?.requireApprovalPatterns ??
    RUN_COMMAND_DEFAULT_REQUIRE_APPROVAL_PATTERNS;
  const maxStdoutBytes = config?.maxStdoutBytes ?? RUN_COMMAND_MAX_STDOUT_BYTES;
  const maxStderrBytes = config?.maxStderrBytes ?? RUN_COMMAND_MAX_STDERR_BYTES;
  const defaultTimeoutMs =
    config?.defaultTimeoutMs ?? RUN_COMMAND_DEFAULT_TIMEOUT_MS;

  const toolPolicies: Policy[] = [];
  if (denyPatterns.length > 0) {
    toolPolicies.push(denyCommandsPolicy(denyPatterns));
  }
  if (approvalPatterns.length > 0) {
    toolPolicies.push(approveCommandsPolicy(approvalPatterns));
  }

  return defineTool<typeof runCommandParams, RunCommandData>({
    description: buildRunCommandDescription(platformInfo),
    systemPrompt: `### Using run_command

\`run_command\` executes a shell command. Use it for project verification (linters, type-checkers, tests, build), running scripts, and one-off CLI operations.

**Required:**

- \`command\`: the shell command to run, as a string. Run **one** command per call.

**Useful optional:**

- \`cwd\`: workspace-relative directory to run the command in (e.g. \`"packages/tui"\`). Defaults to the workspace root.
- \`timeoutMs\`: maximum runtime in milliseconds. Long-running commands are killed past this. Default is generous but finite.

**The cwd rule — read this carefully:**

**Always pass \`cwd\` explicitly** when the command needs a specific working directory. **Never** write \`"cd packages/tui && bun test"\` in the \`command\` — use \`{ command: "bun test", cwd: "packages/tui" }\` instead. Chained \`cd; cmd\` patterns:

- Hide the actual cwd from the tool layer (so error messages are misleading).
- Break when commands fail (the \`cd\` succeeds, the next command runs in the wrong dir on retry).
- Make it impossible for the tool to display the right "Running in X" message.

**Typical verification commands:**

**Use what the project actually configures, not generic defaults.** Read \`package.json\`'s \`scripts\` block (or the equivalent project manifest) once to find out — then reuse those commands for the rest of the session.

- **Biome project** (\`biome.json\` present): the project's lint script (typically \`bun run lint\` → \`biome check\`). Do not also run \`tsc --noEmit\` unless the project's scripts list it as a separate step.
- **ESLint + TypeScript**: both \`bun run lint\` and \`bun run typecheck\` (or \`tsc --noEmit -p <tsconfig>\` if no script).
- **Ruff (Python)**: \`ruff check <path>\`.
- **Cargo (Rust)**: \`cargo check\` and \`cargo clippy\`.
- **Tests**: prefer \`bun test <file>\` or \`bun run test\` (scoped to the file when possible).

**Never run a verifier the project doesn't configure** — running \`tsc --noEmit\` in a Biome-only project, or \`eslint .\` in a Biome project, produces noise the project intentionally doesn't enforce and corrupts downstream iteration loops.

**If you receive a \`Verifier:\` block in your seed input** (typical when launched by the Standardize Manager): those are the project's actual commands — use them verbatim, do not substitute or augment.

**The result includes:**

- \`exitCode\`: 0 = success. Non-zero = failed.
- \`stdout\` and \`stderr\`: captured output (each capped — long output is truncated and flagged).
- \`durationMs\`: how long it ran.

**Hard rules:**

- One command per call. Use multiple \`run_command\` calls for sequential operations.
- Honour the abort signal — long commands time out cleanly.
- Some commands (\`rm -rf\`, etc.) may require user approval via the sandbox — that's expected behaviour, not a bug.`,
    parameters: runCommandParams,
    policies: toolPolicies.length > 0 ? toolPolicies : undefined,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort, agentName } = toolContext;

      if (abort.aborted) {
        return errorResult<RunCommandData>(
          toolError("command_failed", "Operation aborted before start.", {
            recoverable: false,
          }),
        );
      }

      // cwd validation — guard handles path resolution and jail
      let resolvedCwd: string;
      try {
        resolvedCwd =
          validatedArguments.cwd === undefined || validatedArguments.cwd === ""
            ? guard.cwd
            : await guard.authorize(
                { type: "fs.read", resource: validatedArguments.cwd },
                { agentName, toolName: "run_command", signal: abort },
              );
      } catch (caughtError) {
        if (caughtError instanceof SandboxViolationError) {
          return errorResult<RunCommandData>(
            sandboxErrorToToolError(caughtError),
          );
        }
        throw caughtError;
      }

      // Command sandboxing — guard's policy chain handles deny/approval
      try {
        await guard.authorize(
          { type: "command.execute", resource: validatedArguments.command },
          { agentName, toolName: "run_command", signal: abort },
        );
      } catch (caughtError) {
        if (caughtError instanceof SandboxViolationError) {
          return errorResult<RunCommandData>(
            sandboxErrorToToolError(caughtError),
          );
        }
        throw caughtError;
      }

      const timeoutMs = validatedArguments.timeoutMs ?? defaultTimeoutMs;
      const startedAt = Date.now();
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stdoutOverflow = false;
      let stderrOverflow = false;
      let timedOut = false;
      let spawnError: Error | undefined;

      const env = validatedArguments.env
        ? { ...process.env, ...validatedArguments.env }
        : process.env;

      let child: ChildProcessByStdio<null, Readable, Readable>;
      try {
        const shellArgs = platformInfo.shellFlag
          .split(/\s+/)
          .filter((s) => s.length > 0)
          .concat(validatedArguments.command);
        child = spawn(platformInfo.shellPath, shellArgs, {
          cwd: resolvedCwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
          detached: platformInfo.platform !== "win32",
        });
      } catch (spawnError) {
        return errorResult<RunCommandData>(
          toolError(
            "command_failed",
            `Failed to spawn shell ${platformInfo.shellPath}: ${(spawnError as Error).message}`,
            {
              recoverable: false,
              details: { command: validatedArguments.command },
            },
          ),
        );
      }

      const killTree = (signal: NodeJS.Signals) => {
        try {
          if (
            platformInfo.platform !== "win32" &&
            typeof child.pid === "number"
          ) {
            process.kill(-child.pid, signal);
          } else {
            child.kill(signal);
          }
        } catch {
          /* already exited */
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        if (stdoutOverflow) return;
        const remaining = maxStdoutBytes - stdoutBytes;
        if (chunk.byteLength >= remaining) {
          stdoutChunks.push(chunk.subarray(0, remaining + 1));
          stdoutBytes = maxStdoutBytes + 1;
          stdoutOverflow = true;
        } else {
          stdoutChunks.push(chunk);
          stdoutBytes += chunk.byteLength;
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderrOverflow) return;
        const remaining = maxStderrBytes - stderrBytes;
        if (chunk.byteLength >= remaining) {
          stderrChunks.push(chunk.subarray(0, remaining + 1));
          stderrBytes = maxStderrBytes + 1;
          stderrOverflow = true;
        } else {
          stderrChunks.push(chunk);
          stderrBytes += chunk.byteLength;
        }
      });

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        killTree("SIGTERM");
        setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            killTree("SIGKILL");
          }
        }, 5_000).unref();
      }, timeoutMs);

      const onAbort = () => {
        killTree("SIGTERM");
      };
      abort.addEventListener("abort", onAbort, { once: true });

      const { exitCode, signal } = await new Promise<{
        exitCode: number | null;
        signal: NodeJS.Signals | null;
      }>((resolvePromise) => {
        child.on("error", (processError) => {
          spawnError = processError;
          resolvePromise({ exitCode: null, signal: null });
        });
        child.on("close", (code, sig) => {
          resolvePromise({ exitCode: code, signal: sig });
        });
      });

      clearTimeout(timeoutHandle);
      abort.removeEventListener("abort", onAbort);

      const durationMs = Date.now() - startedAt;

      const stdoutOut = truncateOutput(
        Buffer.concat(stdoutChunks),
        maxStdoutBytes,
      );
      const stderrOut = truncateOutput(
        Buffer.concat(stderrChunks),
        maxStderrBytes,
      );

      const data: RunCommandData = {
        command: validatedArguments.command,
        cwd: resolvedCwd,
        exitCode,
        signal,
        stdout: stdoutOut.text,
        stderr: stderrOut.text,
        stdoutTruncated: stdoutOut.truncated,
        stderrTruncated: stderrOut.truncated,
        timedOut,
        durationMs,
        platform: platformInfo,
      };

      if (spawnError) {
        return errorResult<RunCommandData>(
          toolError(
            "command_failed",
            `Shell process error: ${spawnError.message}`,
            {
              recoverable: false,
              details: { command: validatedArguments.command },
            },
          ),
          { data },
        );
      }

      if (timedOut) {
        return errorResult<RunCommandData>(
          toolError(
            "timeout",
            `Command exceeded ${timeoutMs}ms timeout and was terminated.`,
            {
              recoverable: true,
              suggestedNextAction:
                "Increase `timeoutMs`, narrow the command, or split it into smaller steps.",
              details: { command: validatedArguments.command, timeoutMs },
            },
          ),
          { data },
        );
      }

      if (abort.aborted) {
        return errorResult<RunCommandData>(
          toolError("command_failed", "Operation aborted before completion.", {
            recoverable: false,
            details: { command: validatedArguments.command },
          }),
          { data },
        );
      }

      // Format the exit-status banner so the LLM cannot miss it. The
      // original suffix `(exit code 1)` was easy to overlook when the
      // model was scanning a multi-page command output; with explicit
      // `STATUS: FAILED — exit code N` it surfaces clearly even when
      // the stdout / stderr are voluminous.
      //
      // Special cases:
      //   - `exitCode === 0` → success.
      //   - `exitCode === null` → process was killed by a signal (the
      //     `signal` field carries the signal name) or the runtime
      //     could not report an exit code. Treat as failure with an
      //     explicit explanation; this is the situation behind the
      //     reported `(exit code ?)` / `(exit code -1)` confusion that
      //     trapped agents into retry loops.
      //   - Negative `exitCode` (rare; some runtimes use this for
      //     signal-killed processes encoded as `128 + signum` or as
      //     `-signum`) → also treat as failure with the signal note.
      const wasSignalKilled =
        exitCode === null || (typeof exitCode === "number" && exitCode < 0);
      const isFailure = exitCode !== 0;

      let exitSummary: string;
      if (exitCode === 0) {
        exitSummary = "STATUS: SUCCESS — exit code 0";
      } else if (wasSignalKilled) {
        const signalLabel = signal ?? "unknown";
        exitSummary =
          `STATUS: FAILED — process killed by signal ${signalLabel}` +
          ` (no exit code; this means the command crashed, was killed externally, or its runtime could not capture the exit status — it did NOT pass).`;
      } else {
        exitSummary = `STATUS: FAILED — exit code ${exitCode}`;
      }

      const summaryParts: string[] = [
        `Ran \`${validatedArguments.command}\` in ${resolvedCwd} (${durationMs}ms).`,
        exitSummary,
      ];

      if (isFailure) {
        summaryParts.push(
          "The command did NOT succeed. Inspect `stdout` / `stderr` for the diagnostics, then either fix the underlying issue and re-run, or surface this as a `BLOCKED:` outcome — do not treat this output as a green verifier pass.",
        );
      }

      return okResult<RunCommandData>(summaryParts.join("\n"), { data });
    },
  });
}
