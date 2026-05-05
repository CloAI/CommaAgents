/**
 * ExampleRunner — spawn the selected example as a subprocess and stream output.
 *
 * Sets the MODEL env var (e.g. "openai/gpt-4o") and the provider's API key
 * env var, then runs the example with Bun. Output is captured line-by-line
 * and displayed in the terminal with scrollable navigation.
 *
 * Scroll controls:
 *   - Up/Down arrows: scroll one line
 *   - Page Up/Page Down: scroll one page
 *   - Home/End (or g/G): jump to top/bottom
 *   - Auto-follows output while running (unless user scrolls up)
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useRef, useState } from "react";
import { useTerminalSize } from "../hooks/useTerminalSize";
import type { ExampleEntry } from "./ExampleSelect";
import type { ProviderSelection } from "./ProviderSelect";

interface ExampleRunnerProps {
  provider: ProviderSelection;
  example: ExampleEntry;
  onDone: () => void;
}

type RunState = "running" | "success" | "error";

/**
 * Number of fixed chrome lines (header, separator, running/provider info,
 * output header, status bar, margins, scroll hints).
 * Used to compute the dynamic page size from terminal height.
 */
const CHROME_LINES = 12;

export function ExampleRunner({ provider, example, onDone }: ExampleRunnerProps) {
  const { exit } = useApp();
  const { rows } = useTerminalSize();
  const [state, setState] = useState<RunState>("running");
  const [output, setOutput] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  /** Whether the user has manually scrolled away from the bottom. */
  const userScrolledRef = useRef(false);

  /** Dynamic page size based on terminal height minus chrome. */
  const pageSize = Math.max(5, rows - CHROME_LINES);

  // Auto-follow: when new output arrives and user hasn't scrolled up, snap to bottom.
  useEffect(() => {
    if (!userScrolledRef.current) {
      setScrollOffset(Math.max(0, output.length - pageSize));
    }
  }, [output.length, pageSize]);

  useInput((input, key) => {
    const maxOffset = Math.max(0, output.length - pageSize);

    // Scroll controls (available in all states)
    if (key.upArrow) {
      userScrolledRef.current = true;
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setScrollOffset((prev) => {
        const next = Math.min(maxOffset, prev + 1);
        if (next >= maxOffset) userScrolledRef.current = false;
        return next;
      });
      return;
    }
    if (key.pageUp) {
      userScrolledRef.current = true;
      setScrollOffset((prev) => Math.max(0, prev - pageSize));
      return;
    }
    if (key.pageDown) {
      setScrollOffset((prev) => {
        const next = Math.min(maxOffset, prev + pageSize);
        if (next >= maxOffset) userScrolledRef.current = false;
        return next;
      });
      return;
    }
    // Home / g → top
    if (input === "g") {
      userScrolledRef.current = true;
      setScrollOffset(0);
      return;
    }
    // End / G → bottom
    if (input === "G") {
      userScrolledRef.current = false;
      setScrollOffset(maxOffset);
      return;
    }

    // Action controls (only when done)
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

    const args =
      example.category === "e2e"
        ? ["test", scriptPath]
        : ["run", scriptPath];

    const child = spawn("bun", args, {
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

  const visibleOutput = output.slice(scrollOffset, scrollOffset + pageSize);
  const maxOffset = Math.max(0, output.length - pageSize);
  const atBottom = scrollOffset >= maxOffset;
  const showScrollHint = output.length > pageSize;

  return (
    <Box flexDirection="column" height={rows}>
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

      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        <Box>
          <Text dimColor>── Output ──────────────────</Text>
          {showScrollHint && (
            <Text dimColor>
              {" "}
              [{scrollOffset + 1}-{Math.min(scrollOffset + pageSize, output.length)}/{output.length}
              ]
            </Text>
          )}
        </Box>
        {!atBottom && scrollOffset > 0 && <Text dimColor>{"  ▲ more above"}</Text>}
        {visibleOutput.map((line, i) => (
          <Text key={`${scrollOffset + i}-${line.slice(0, 20)}`}>{line}</Text>
        ))}
        {!atBottom && <Text dimColor>{"  ▼ more below"}</Text>}
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
            <Text dimColor>Press r to run another, q to quit | Scroll: arrows, PgUp/PgDn, g/G</Text>
          </Box>
        )}
        {state === "error" && (
          <Box flexDirection="column">
            <Text color="red">Failed (exit code {exitCode})</Text>
            <Text dimColor>Press r to run another, q to quit | Scroll: arrows, PgUp/PgDn, g/G</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
