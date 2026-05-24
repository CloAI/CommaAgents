// Tests for `launch_strategy`.
//
// Two paths are exercised:
//   1. Runtime handle present — `toolContext.launchStrategy` is invoked
//      and its result is wrapped into a `LaunchStrategyData` payload.
//   2. Fallback — no runtime handle, the tool reads the strategy file
//      itself and runs it via `loadStrategyFromString` + `flow.call`.

import { describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeToolContext } from "../../test.utils";
import type {
  LaunchStrategyHandle,
  LaunchStrategyResult,
} from "../../launch-strategy.types";
import { createLaunchStrategyTool } from "./launch-strategy";

const ECHO_STRATEGY = {
  name: "echo-strategy",
  version: "1.0.0",
  description: "Echoes input back through a no-op user step.",
  agents: {
    echo: {
      type: "user" as const,
      config: { requireInput: false },
    },
  },
  flow: {
    type: "sequential" as const,
    name: "main",
    steps: [{ agent: "echo" }],
  },
};

function createScratchDir(label: string): string {
  const dir = join(
    tmpdir(),
    `comma-launch-strategy-${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function withCwdContaining(strategy: object): { cwd: string; cleanup: () => void } {
  const cwd = createScratchDir("strategy-host");
  const strategiesDir = join(cwd, ".comma", "strategies");
  mkdirSync(strategiesDir, { recursive: true });
  writeFileSync(
    join(strategiesDir, "demo.json"),
    JSON.stringify(strategy),
    "utf8",
  );
  return {
    cwd,
    cleanup: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}

describe("createLaunchStrategyTool", () => {
  it("returns a tool definition with non-empty description", () => {
    const tool = createLaunchStrategyTool();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("returns not_found when the requested name does not exist", async () => {
    const tool = createLaunchStrategyTool();
    const ctx = makeToolContext();
    const result = await tool.execute(
      { name: "this-strategy-does-not-exist", input: "hi" },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
    expect(Array.isArray((result.error?.details as { available?: string[] })?.available)).toBe(true);
  });

  it("delegates to toolContext.launchStrategy when present", async () => {
    const { cwd, cleanup } = withCwdContaining(ECHO_STRATEGY);
    const originalCwd = process.cwd();
    process.chdir(cwd);
    try {
      const calls: Array<{ strategyPath: string; input: string }> = [];
      const handle: LaunchStrategyHandle = async (request) => {
        calls.push({
          strategyPath: request.strategyPath,
          input: request.input,
        });
        const result: LaunchStrategyResult = {
          strategyName: "echo-strategy",
          text: `handle-saw: ${request.input}`,
          finishReason: "stop",
        };
        return result;
      };

      const tool = createLaunchStrategyTool();
      const result = await tool.execute(
        { name: "echo-strategy", input: "hello" },
        makeToolContext({ launchStrategy: handle }),
      );
      expect(result.ok).toBe(true);
      expect(result.data?.strategyName).toBe("echo-strategy");
      expect(result.data?.result).toBe("handle-saw: hello");
      expect(result.data?.finishReason).toBe("stop");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.input).toBe("hello");
      expect(calls[0]?.strategyPath.endsWith("demo.json")).toBe(true);
    } finally {
      process.chdir(originalCwd);
      cleanup();
    }
  });

  it("falls back to in-process loadStrategy when no handle is provided", async () => {
    const { cwd, cleanup } = withCwdContaining(ECHO_STRATEGY);
    const originalCwd = process.cwd();
    process.chdir(cwd);
    try {
      const tool = createLaunchStrategyTool();
      const result = await tool.execute(
        { name: "echo-strategy", input: "hello-fallback" },
        makeToolContext(),
      );
      expect(result.ok).toBe(true);
      // The trivial echo user agent with requireInput: false just passes
      // the incoming message through.
      expect(result.data?.strategyName).toBe("echo-strategy");
      expect(result.data?.result).toBe("hello-fallback");
    } finally {
      process.chdir(originalCwd);
      cleanup();
    }
  });

  it("returns unknown when the runtime handle throws", async () => {
    const { cwd, cleanup } = withCwdContaining(ECHO_STRATEGY);
    const originalCwd = process.cwd();
    process.chdir(cwd);
    try {
      const handle: LaunchStrategyHandle = async () => {
        throw new Error("synthetic launch failure");
      };
      const tool = createLaunchStrategyTool();
      const result = await tool.execute(
        { name: "echo-strategy", input: "x" },
        makeToolContext({ launchStrategy: handle }),
      );
      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("unknown");
      expect(result.error?.message).toContain("synthetic launch failure");
    } finally {
      process.chdir(originalCwd);
      cleanup();
    }
  });
});
