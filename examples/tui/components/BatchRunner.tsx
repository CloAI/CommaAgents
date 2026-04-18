/**
 * BatchRunner — run all examples sequentially in non-interactive mode.
 *
 * Spawns each example as a subprocess, streams output, prints a summary
 * at the end with pass/fail status for each example.
 *
 * When daemon examples are included, the runner automatically starts a
 * daemon server (with --model-override) before those examples and stops
 * it afterwards.
 */

import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
import type { ExampleEntry } from "../examples";
import { useTerminalSize } from "../hooks/useTerminalSize";
import type { ProviderSelection } from "./ProviderSelect";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BatchRunnerProps {
  provider: ProviderSelection;
  examples: ExampleEntry[];
  /** When provided, the runner shows interactive controls instead of auto-exiting. */
  onDone?: () => void;
}

interface ExampleResult {
  example: ExampleEntry;
  exitCode: number | null;
  durationMs: number;
  output: string[];
}

type BatchState = "running" | "done";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAEMON_PORT = 7422;
const DAEMON_HEALTH_URL = `http://127.0.0.1:${DAEMON_PORT}/health`;
const DAEMON_CLI_PATH = "packages/daemon/src/cli.ts";
/** Per-example timeout in milliseconds. Kills the subprocess if exceeded. */
const EXAMPLE_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchRunner({ provider, examples, onDone }: BatchRunnerProps) {
  const { exit } = useApp();
  const { rows } = useTerminalSize();
  const [state, setState] = useState<BatchState>("running");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentOutput, setCurrentOutput] = useState<string[]>([]);
  const [results, setResults] = useState<ExampleResult[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);

  // Handle keyboard input when batch is done (interactive mode only)
  useInput((input, key) => {
    if (state === "done" && onDone) {
      if (input === "b") {
        onDone();
      } else if (input === "q" || key.escape) {
        exit();
      }
    }
  });

  // Run examples sequentially
  useEffect(() => {
    let cancelled = false;
    let daemonProcess: ChildProcess | null = null;

    async function runAll() {
      const allResults: ExampleResult[] = [];

      // Split into core and daemon examples (preserving order)
      const coreExamples = examples.filter((e) => e.category === "core");
      const daemonExamples = examples.filter((e) => e.category === "daemon");

      // -- Run core examples (no daemon needed) --
      for (let i = 0; i < coreExamples.length; i++) {
        if (cancelled) break;

        const example = coreExamples[i];
        if (!example) break;
        setCurrentIndex(allResults.length);
        setCurrentOutput([]);
        setStatusMessage(null);

        const result = await runExample(example, provider, (line) => {
          if (!cancelled) {
            setCurrentOutput((prev) => [...prev, line]);
          }
        });

        allResults.push(result);
        setResults([...allResults]);
      }

      // -- Start daemon if daemon examples exist --
      if (daemonExamples.length > 0 && !cancelled) {
        setStatusMessage("Starting daemon server...");

        try {
          daemonProcess = await startDaemon(provider);
        } catch (err) {
          // If daemon fails to start, mark all daemon examples as failed
          const errMsg = err instanceof Error ? err.message : String(err);
          for (const example of daemonExamples) {
            allResults.push({
              example,
              exitCode: 1,
              durationMs: 0,
              output: [`[daemon] Failed to start: ${errMsg}`],
            });
          }
          setResults([...allResults]);
          if (!cancelled) {
            setState("done");
          }
          return;
        }

        setStatusMessage(null);

        // -- Run daemon examples --
        for (let i = 0; i < daemonExamples.length; i++) {
          if (cancelled) break;

          const example = daemonExamples[i];
          if (!example) break;
          setCurrentIndex(allResults.length);
          setCurrentOutput([]);

          const result = await runExample(example, provider, (line) => {
            if (!cancelled) {
              setCurrentOutput((prev) => [...prev, line]);
            }
          });

          allResults.push(result);
          setResults([...allResults]);
        }

        // -- Stop daemon --
        setStatusMessage("Stopping daemon server...");
        stopDaemon(daemonProcess);
        daemonProcess = null;
        setStatusMessage(null);
      }

      if (!cancelled) {
        setState("done");
      }
    }

    runAll();
    return () => {
      cancelled = true;
      if (daemonProcess) {
        stopDaemon(daemonProcess);
      }
    };
  }, [examples, provider]);

  // Write error log and auto-exit (or wait for user input in interactive mode)
  useEffect(() => {
    if (state === "done") {
      const failed = results.filter((result) => result.exitCode !== 0);

      // Write error log if there were failures
      if (failed.length > 0) {
        const writtenLogPath = writeErrorLog(results, provider);
        setLogPath(writtenLogPath);
      }

      // In non-interactive mode (no onDone), auto-exit after a small delay
      if (!onDone) {
        const timer = setTimeout(() => {
          exit();
          process.exitCode = failed.length > 0 ? 1 : 0;
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [state, results, exit, onDone, provider]);

  const currentExample = examples[currentIndex];
  // Reserve lines for chrome (header, progress, completed results, separator, etc.)
  const chromeLines = 8 + results.length;
  const maxOutputLines = Math.max(5, rows - chromeLines);
  const visibleOutput =
    currentOutput.length > maxOutputLines ? currentOutput.slice(-maxOutputLines) : currentOutput;

  // ---------------------------------------------------------------------------
  // Summary view
  // ---------------------------------------------------------------------------

  if (state === "done") {
    const passed = results.filter((r) => r.exitCode === 0);
    const failed = results.filter((r) => r.exitCode !== 0);

    return (
      <Box flexDirection="column" height={rows}>
        <Text bold color="cyan">
          Batch Run Complete
        </Text>
        <Text dimColor>─────────────────────────────</Text>
        <Box marginTop={1}>
          <Text>
            Provider:{" "}
            <Text color="green">
              {provider.providerID}/{provider.model}
            </Text>
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Results:</Text>
          {results.map((r) => {
            const ok = r.exitCode === 0;
            const icon = ok ? "\u2713" : "\u2717";
            const duration = (r.durationMs / 1000).toFixed(1);
            return (
              <Text key={r.example.value}>
                <Text color={ok ? "green" : "red"}> {icon} </Text>
                <Text>{r.example.label}</Text>
                <Text dimColor>
                  {" "}
                  ({duration}s, exit {r.exitCode})
                </Text>
              </Text>
            );
          })}
        </Box>

        <Box marginTop={1}>
          <Text bold>
            <Text color="green">{passed.length} passed</Text>
            {failed.length > 0 && (
              <Text>
                {" "}
                <Text color="red">{failed.length} failed</Text>
              </Text>
            )}
            <Text dimColor> / {results.length} total</Text>
          </Text>
        </Box>

        {failed.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="red">
              Failed examples:
            </Text>
            {failed.map((failedResult) => (
              <Box key={failedResult.example.value} flexDirection="column">
                <Text color="red"> {failedResult.example.label}:</Text>
                {failedResult.output.slice(-5).map((line, lineIndex) => (
                  <Text
                    key={`${failedResult.example.value}-line-${line.slice(0, 30)}-${lineIndex}`}
                    dimColor
                  >
                    {"    "}
                    {line}
                  </Text>
                ))}
              </Box>
            ))}
          </Box>
        )}

        {logPath && (
          <Box marginTop={1}>
            <Text>
              Error log written to: <Text color="yellow">{logPath}</Text>
            </Text>
          </Box>
        )}

        {onDone && (
          <Box marginTop={1}>
            <Text dimColor>Press b to go back to examples, q to quit</Text>
          </Box>
        )}
      </Box>
    );
  }

  // ---------------------------------------------------------------------------
  // Running view
  // ---------------------------------------------------------------------------

  return (
    <Box flexDirection="column" height={rows}>
      <Text bold color="cyan">
        Batch Run
      </Text>
      <Text dimColor>─────────────────────────────</Text>
      <Box marginTop={1}>
        <Text>
          Provider:{" "}
          <Text color="green">
            {provider.providerID}/{provider.model}
          </Text>
        </Text>
      </Box>

      {/* Status message (daemon start/stop) */}
      {statusMessage && (
        <Box marginTop={1}>
          <Text>
            <Spinner type="dots" /> <Text color="yellow">{statusMessage}</Text>
          </Text>
        </Box>
      )}

      {/* Progress */}
      {!statusMessage && (
        <Box marginTop={1}>
          <Text>
            <Spinner type="dots" />{" "}
            <Text bold>
              [{currentIndex + 1}/{examples.length}]
            </Text>{" "}
            {currentExample?.label ?? "..."}
          </Text>
        </Box>
      )}

      {/* Already completed */}
      {results.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {results.map((r) => {
            const ok = r.exitCode === 0;
            const icon = ok ? "\u2713" : "\u2717";
            const duration = (r.durationMs / 1000).toFixed(1);
            return (
              <Text key={r.example.value}>
                <Text color={ok ? "green" : "red"}> {icon} </Text>
                <Text>{r.example.label}</Text>
                <Text dimColor> ({duration}s)</Text>
              </Text>
            );
          })}
        </Box>
      )}

      {/* Live output of current example */}
      {visibleOutput.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>── Output ──────────────────</Text>
          {visibleOutput.map((line, i) => (
            <Text key={`out-${line.slice(0, 40)}-${i}`} dimColor>
              {line}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Daemon lifecycle (non-React)
// ---------------------------------------------------------------------------

/**
 * Start the daemon as a foreground subprocess with --model-override.
 * Waits for the /health endpoint to respond before resolving.
 */
function startDaemon(provider: ProviderSelection): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const repoRoot = path.resolve(import.meta.dir, "../../..");
    const cliPath = path.resolve(repoRoot, DAEMON_CLI_PATH);
    const modelOverride = `${provider.providerID}/${provider.model}`;

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      // Set the provider's env var so the daemon's credential store resolves it
      [provider.envVar]: provider.apiKey,
    };

    const child = spawn(
      "bun",
      [
        "-i",
        "run",
        cliPath,
        "start",
        "--foreground",
        "--port",
        String(DAEMON_PORT),
        "--model-override",
        modelOverride,
      ],
      {
        cwd: repoRoot,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let settled = false;

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Failed to spawn daemon process: ${err.message}`));
      }
    });

    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Daemon process exited prematurely with code ${code}`));
      }
    });

    // Poll /health until it responds (timeout 15s)
    const deadline = Date.now() + 15_000;
    const pollInterval = 300;

    const poll = async () => {
      while (Date.now() < deadline) {
        try {
          const res = await fetch(DAEMON_HEALTH_URL);
          if (res.ok) {
            if (!settled) {
              settled = true;
              resolve(child);
            }
            return;
          }
        } catch {
          // Connection refused — daemon still starting
        }
        await new Promise((r) => setTimeout(r, pollInterval));
      }

      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        reject(new Error(`Daemon did not become healthy within 15s (${DAEMON_HEALTH_URL})`));
      }
    };

    poll();
  });
}

/**
 * Stop the daemon by sending SIGTERM to the child process.
 */
function stopDaemon(child: ChildProcess): void {
  try {
    child.kill("SIGTERM");
  } catch {
    // Already dead
  }
}

// ---------------------------------------------------------------------------
// Error logging (non-React)
// ---------------------------------------------------------------------------

/**
 * Write a log file containing all errors from the batch run.
 * Returns the path to the log file, or null if writing failed.
 */
function writeErrorLog(results: ExampleResult[], provider: ProviderSelection): string | null {
  try {
    const examplesDir = path.resolve(import.meta.dir, "../..");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logFileName = `batch-errors-${timestamp}.log`;
    const logFilePath = path.join(examplesDir, logFileName);

    const failedResults = results.filter((result) => result.exitCode !== 0);
    const lines: string[] = [
      `Batch Run Error Log`,
      `Date: ${new Date().toISOString()}`,
      `Provider: ${provider.providerID}/${provider.model}`,
      `Total: ${results.length} | Passed: ${results.length - failedResults.length} | Failed: ${failedResults.length}`,
      "",
    ];

    for (const result of failedResults) {
      lines.push(
        `--- ${result.example.label} (exit code ${result.exitCode}, ${(result.durationMs / 1000).toFixed(1)}s) ---`,
      );
      for (const outputLine of result.output) {
        lines.push(`  ${outputLine}`);
      }
      lines.push("");
    }

    fs.writeFileSync(logFilePath, lines.join("\n"), "utf-8");
    return logFilePath;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Subprocess runner (non-React)
// ---------------------------------------------------------------------------

function runExample(
  example: ExampleEntry,
  provider: ProviderSelection,
  onLine: (line: string) => void,
): Promise<ExampleResult> {
  return new Promise((resolve) => {
    const examplesDir = path.resolve(import.meta.dir, "../..");
    const scriptPath = path.resolve(examplesDir, example.value);
    const startTime = Date.now();
    const output: string[] = [];

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      MODEL: `${provider.providerID}/${provider.model}`,
      [provider.envVar]: provider.apiKey,
    };

    const stdinMode = example.interactive ? "pipe" : "ignore";

    const child = spawn("bun", ["run", scriptPath], {
      cwd: examplesDir,
      env,
      stdio: [stdinMode, "pipe", "pipe"],
    });

    // For interactive examples, periodically write "done\n" to stdin so
    // readline-based prompts resolve without human input. The example treats
    // "done" as the exit keyword.
    let stdinInterval: ReturnType<typeof setInterval> | undefined;
    if (example.interactive && child.stdin) {
      stdinInterval = setInterval(() => {
        try {
          child.stdin?.write("done\n");
        } catch {
          // stdin closed — stop writing
          if (stdinInterval) clearInterval(stdinInterval);
        }
      }, 1_000);
    }

    const handleData = (data: Buffer) => {
      const text = data.toString("utf-8");
      for (const line of text.split("\n")) {
        if (line.length > 0) {
          output.push(line);
          onLine(line);
        }
      }
    };

    child.stdout?.on("data", handleData);
    child.stderr?.on("data", handleData);

    // Timeout: kill the subprocess if it runs too long
    const timer = setTimeout(() => {
      const line = `[timeout] Example exceeded ${EXAMPLE_TIMEOUT_MS / 1000}s limit — killed`;
      output.push(line);
      onLine(line);
      if (stdinInterval) clearInterval(stdinInterval);
      try {
        child.kill("SIGKILL");
      } catch {
        // Already dead
      }
    }, EXAMPLE_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (stdinInterval) clearInterval(stdinInterval);
      resolve({
        example,
        exitCode: code,
        durationMs: Date.now() - startTime,
        output,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      if (stdinInterval) clearInterval(stdinInterval);
      const line = `[spawn error] ${err.message}`;
      output.push(line);
      onLine(line);
      resolve({
        example,
        exitCode: 1,
        durationMs: Date.now() - startTime,
        output,
      });
    });
  });
}
