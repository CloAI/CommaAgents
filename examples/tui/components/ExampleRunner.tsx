/**
 * ExampleRunner — spawn the selected example as a subprocess and stream output.
 *
 * Sets the MODEL env var (e.g. "openai/gpt-4o") and the provider's API key
 * env var, then runs the example with Bun. Output is captured line-by-line
 * and displayed in the terminal.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
import type { ExampleEntry } from "./ExampleSelect";
import type { ProviderSelection } from "./ProviderSelect";

interface ExampleRunnerProps {
  provider: ProviderSelection;
  example: ExampleEntry;
  onDone: () => void;
}

type RunState = "running" | "success" | "error";

export function ExampleRunner({ provider, example, onDone }: ExampleRunnerProps) {
  const { exit } = useApp();
  const [state, setState] = useState<RunState>("running");
  const [output, setOutput] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);

  useInput((input, key) => {
    if (state !== "running") {
      if (input === "r") {
        onDone();
      } else if (input === "q" || key.escape) {
        exit();
      }
    }
  });

  useEffect(() => {
    const examplesDir = path.resolve(import.meta.dir, "../..");
    const scriptPath = path.resolve(examplesDir, example.value);

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      MODEL: `${provider.providerID}/${provider.model}`,
      [provider.envVar]: provider.apiKey,
    };

    const child = spawn("bun", ["run", scriptPath], {
      cwd: examplesDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const appendLine = (line: string) => {
      setOutput((prev) => [...prev, line]);
    };

    const handleData = (data: Buffer) => {
      const text = data.toString("utf-8");
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.length > 0) {
          appendLine(line);
        }
      }
    };

    child.stdout.on("data", handleData);
    child.stderr.on("data", handleData);

    child.on("close", (code) => {
      setExitCode(code);
      setState(code === 0 ? "success" : "error");
    });

    child.on("error", (err) => {
      appendLine(`[spawn error] ${err.message}`);
      setState("error");
    });

    return () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    };
  }, [example.value, provider.providerID, provider.model, provider.envVar, provider.apiKey]);

  const maxLines = 40;
  const visibleOutput = output.length > maxLines ? output.slice(-maxLines) : output;

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        comma-agents Example Runner
      </Text>
      <Text dimColor>─────────────────────────────</Text>
      <Box marginTop={1}>
        <Text>
          Running: <Text color="green">{example.label}</Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          Provider:{" "}
          <Text color="green">
            {provider.providerID}/{provider.model}
          </Text>
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>── Output ──────────────────</Text>
        {visibleOutput.map((line, i) => (
          <Text key={`${i}-${line.slice(0, 20)}`}>{line}</Text>
        ))}
      </Box>

      <Box marginTop={1}>
        {state === "running" && (
          <Text>
            <Spinner type="dots" /> Running...
          </Text>
        )}
        {state === "success" && (
          <Box flexDirection="column">
            <Text color="green">Done (exit code {exitCode})</Text>
            <Text dimColor>Press r to run another example, q to quit</Text>
          </Box>
        )}
        {state === "error" && (
          <Box flexDirection="column">
            <Text color="red">Failed (exit code {exitCode})</Text>
            <Text dimColor>Press r to run another example, q to quit</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
