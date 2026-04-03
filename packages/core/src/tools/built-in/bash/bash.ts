// bash — execute shell commands as an agent tool

import { spawn } from "node:child_process";
import { z } from "zod";
import { defineTool } from "../../define/define-tool";
import type { ToolDefinition } from "../../tool.types";

/**
 * Configuration for the bash tool.
 */
export interface BashToolConfig {
  /** Default timeout in milliseconds (default: 120_000). */
  readonly defaultTimeout?: number;
  /** Working directory for command execution. */
  readonly workingDirectory?: string;
}

const DEFAULT_BASH_TIMEOUT = 120_000;

const bashParams = z.object({
  command: z.string().describe("The shell command to execute."),
  timeout: z
    .number()
    .optional()
    .describe("Optional timeout in milliseconds. Defaults to 120000 (2 minutes)."),
  workdir: z.string().optional().describe("Optional working directory for the command."),
});

/**
 * Execute a shell command in a subprocess, capturing stdout and stderr.
 *
 * Spawns the command via `sh -c`, enforces a configurable timeout,
 * and propagates the AbortSignal from the tool context for cancellation.
 */
function executeCommand(
  command: string,
  options: {
    timeout: number;
    workdir?: string;
    signal?: AbortSignal;
  },
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const childProcess = spawn("sh", ["-c", command], {
      cwd: options.workdir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      childProcess.kill("SIGTERM");
      setTimeout(() => {
        if (!childProcess.killed) childProcess.kill("SIGKILL");
      }, 1_000);
    }, options.timeout);

    // Handle abort signal
    if (options.signal) {
      const onAbort = () => {
        childProcess.kill("SIGTERM");
        setTimeout(() => {
          if (!childProcess.killed) childProcess.kill("SIGKILL");
        }, 1_000);
      };
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    childProcess.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    childProcess.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    childProcess.on("error", (error) => {
      clearTimeout(timer);
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        resolve({
          stdout: "",
          stderr: "Error: shell interpreter not found",
          exitCode: 127,
        });
      } else {
        reject(error);
      }
    });

    childProcess.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: code,
      });
    });
  });
}

/**
 * Create a bash tool for executing shell commands.
 *
 * @example
 * ```ts
 * const bash = createBashTool();
 * const tools = { bash };
 *
 * // With custom defaults
 * const bash = createBashTool({
 *   defaultTimeout: 60_000,
 *   workingDirectory: "/tmp",
 * });
 * ```
 */
export function createBashTool(config?: BashToolConfig): ToolDefinition<typeof bashParams> {
  const defaultTimeout = config?.defaultTimeout ?? DEFAULT_BASH_TIMEOUT;
  const defaultWorkdir = config?.workingDirectory;

  return defineTool({
    description:
      "Execute a shell command. The command runs in a subprocess via `sh -c` " +
      "and the output (stdout/stderr) is returned. Use this for running build tools, " +
      "git commands, installing packages, running scripts, or any other terminal operation.",
    parameters: bashParams,
    execute: async (validatedArguments, toolContext) => {
      const timeout = validatedArguments.timeout ?? defaultTimeout;
      const workdir = validatedArguments.workdir ?? defaultWorkdir;
      const startTime = Date.now();

      const result = await executeCommand(validatedArguments.command, {
        timeout,
        workdir,
        signal: toolContext.abort,
      });

      const durationMs = Date.now() - startTime;
      const parts: string[] = [];

      if (result.stdout.trim()) {
        parts.push(result.stdout.trimEnd());
      }
      if (result.stderr.trim()) {
        parts.push(`[stderr]\n${result.stderr.trimEnd()}`);
      }
      if (parts.length === 0) {
        parts.push(result.exitCode === 0 ? "[No output]" : "[Command failed with no output]");
      }
      if (result.exitCode !== null && result.exitCode !== 0) {
        parts.push(`[exit code: ${result.exitCode}]`);
      }

      return {
        output: parts.join("\n"),
        metadata: {
          exitCode: result.exitCode,
          durationMs,
          command: validatedArguments.command,
        },
      };
    },
  });
}
