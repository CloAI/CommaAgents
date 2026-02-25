// Tests for the bash built-in tool

import { describe, expect, it } from "bun:test";
import type { ToolContext } from "../tool";
import { createBashTool } from "./bash";

const ctx: ToolContext = {
  agentName: "test-agent",
  abort: AbortSignal.timeout(10_000),
};

describe("createBashTool", () => {
  it("should create a tool with correct description and parameters", () => {
    const tool = createBashTool();
    expect(tool.description).toContain("shell command");
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });

  it("should execute a simple command and return stdout", async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: "echo hello world" }, ctx);
    expect(result.output).toContain("hello world");
    expect(result.metadata?.exitCode).toBe(0);
  });

  it("should capture stderr", async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: "echo error >&2" }, ctx);
    expect(result.output).toContain("[stderr]");
    expect(result.output).toContain("error");
  });

  it("should report non-zero exit codes", async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: "exit 42" }, ctx);
    expect(result.output).toContain("[exit code: 42]");
    expect(result.metadata?.exitCode).toBe(42);
  });

  it("should handle commands with no output", async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: "true" }, ctx);
    expect(result.output).toContain("[No output]");
  });

  it("should handle failed commands with no output", async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: "false" }, ctx);
    expect(result.output).toContain("[Command failed with no output]");
    expect(result.output).toContain("[exit code: 1]");
  });

  it("should respect custom timeout", async () => {
    const tool = createBashTool({ defaultTimeout: 1_000 });
    const start = Date.now();
    const result = await tool.execute({ command: "sleep 10" }, ctx);
    const elapsed = Date.now() - start;
    // Should have been killed before 10 seconds
    expect(elapsed).toBeLessThan(5_000);
    expect(result.metadata?.exitCode).not.toBe(0);
  });

  it("should use custom working directory", async () => {
    const tool = createBashTool({ workingDirectory: "/tmp" });
    const result = await tool.execute({ command: "pwd" }, ctx);
    expect(result.output).toContain("/tmp");
  });

  it("should allow per-call working directory override", async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: "pwd", workdir: "/tmp" }, ctx);
    expect(result.output).toContain("/tmp");
  });

  it("should include duration in metadata", async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: "echo fast" }, ctx);
    expect(result.metadata?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should handle multiline output", async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: 'echo "line1\nline2\nline3"' }, ctx);
    expect(result.output).toContain("line1");
    expect(result.output).toContain("line2");
    expect(result.output).toContain("line3");
  });
});
