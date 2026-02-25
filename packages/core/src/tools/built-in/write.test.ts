// Tests for the write built-in tool

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolContext } from "../tool";
import { createWriteTool } from "./write";

const ctx: ToolContext = {
  agentName: "test-agent",
  abort: AbortSignal.timeout(5000),
};

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "write-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("createWriteTool", () => {
  it("should create a tool with correct description", () => {
    const tool = createWriteTool();
    expect(tool.description).toContain("Write content");
    expect(typeof tool.execute).toBe("function");
  });

  it("should write a new file", async () => {
    const tool = createWriteTool();
    const filePath = join(testDir, "new.txt");
    const result = await tool.execute({ filePath, content: "hello world" }, ctx);

    expect(result.output).toContain("Successfully wrote");
    expect(result.output).toContain("11 bytes");

    const written = await readFile(filePath, "utf-8");
    expect(written).toBe("hello world");
  });

  it("should overwrite an existing file", async () => {
    const filePath = join(testDir, "existing.txt");
    const { writeFile: fsWriteFile } = await import("node:fs/promises");
    await fsWriteFile(filePath, "old content");

    const tool = createWriteTool();
    const result = await tool.execute({ filePath, content: "new content" }, ctx);

    expect(result.output).toContain("Successfully wrote");
    const written = await readFile(filePath, "utf-8");
    expect(written).toBe("new content");
  });

  it("should create parent directories", async () => {
    const tool = createWriteTool();
    const filePath = join(testDir, "a", "b", "c", "deep.txt");
    const result = await tool.execute({ filePath, content: "deep content" }, ctx);

    expect(result.output).toContain("Successfully wrote");
    const written = await readFile(filePath, "utf-8");
    expect(written).toBe("deep content");
  });

  it("should report bytes and lines in output", async () => {
    const tool = createWriteTool();
    const filePath = join(testDir, "multi.txt");
    const result = await tool.execute(
      {
        filePath,
        content: "line1\nline2\nline3",
      },
      ctx,
    );

    expect(result.output).toContain("3 lines");
    expect(result.metadata?.lines).toBe(3);
    expect(result.metadata?.bytes).toBeGreaterThan(0);
  });

  it("should include metadata", async () => {
    const tool = createWriteTool();
    const filePath = join(testDir, "meta.txt");
    const result = await tool.execute({ filePath, content: "test" }, ctx);

    expect(result.metadata?.filePath).toBe(filePath);
    expect(result.metadata?.bytes).toBe(4);
    expect(result.metadata?.lines).toBe(1);
  });
});
