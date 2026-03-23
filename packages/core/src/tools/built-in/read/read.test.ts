// Tests for the read built-in tool

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolContext } from "../../tool.types";
import { createReadTool } from "./read";

const ctx: ToolContext = {
  agentName: "test-agent",
  abort: AbortSignal.timeout(5000),
};

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "read-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("createReadTool", () => {
  it("should create a tool with correct description", () => {
    const tool = createReadTool();
    expect(tool.description).toContain("Read a file");
    expect(typeof tool.execute).toBe("function");
  });

  it("should read a file with line numbers", async () => {
    const filePath = join(testDir, "test.txt");
    await writeFile(filePath, "line one\nline two\nline three\n");

    const tool = createReadTool();
    const result = await tool.execute({ filePath }, ctx);

    expect(result.output).toContain("1: line one");
    expect(result.output).toContain("2: line two");
    expect(result.output).toContain("3: line three");
  });

  it("should support offset parameter", async () => {
    const filePath = join(testDir, "test.txt");
    await writeFile(filePath, "a\nb\nc\nd\ne\n");

    const tool = createReadTool();
    const result = await tool.execute({ filePath, offset: 3 }, ctx);

    expect(result.output).toContain("3: c");
    expect(result.output).not.toContain("1: a");
    expect(result.output).not.toContain("2: b");
  });

  it("should support limit parameter", async () => {
    const filePath = join(testDir, "test.txt");
    await writeFile(filePath, "a\nb\nc\nd\ne\n");

    const tool = createReadTool();
    const result = await tool.execute({ filePath, limit: 2 }, ctx);

    expect(result.output).toContain("1: a");
    expect(result.output).toContain("2: b");
    expect(result.output).not.toContain("3: c");
    expect(result.output).toContain("Use offset=3 to read more");
  });

  it("should list directory contents", async () => {
    await writeFile(join(testDir, "file.txt"), "content");
    await mkdir(join(testDir, "subdir"));

    const tool = createReadTool();
    const result = await tool.execute({ filePath: testDir }, ctx);

    expect(result.output).toContain("file.txt");
    expect(result.output).toContain("subdir/");
    expect(result.metadata?.type).toBe("directory");
  });

  it("should return error for non-existent path", async () => {
    const tool = createReadTool();
    const result = await tool.execute({ filePath: "/nonexistent/file.txt" }, ctx);

    expect(result.output).toContain("Error");
    expect(result.output).toContain("not found");
    expect(result.metadata?.error).toBe(true);
  });

  it("should truncate long lines", async () => {
    const filePath = join(testDir, "long.txt");
    const longLine = "x".repeat(3000);
    await writeFile(filePath, longLine);

    const tool = createReadTool({ maxLineLength: 100 });
    const result = await tool.execute({ filePath }, ctx);

    expect(result.output).toContain("...");
    // Should not contain the full 3000-char line
    expect(result.output.length).toBeLessThan(3000);
  });

  it("should show end-of-file marker", async () => {
    const filePath = join(testDir, "small.txt");
    await writeFile(filePath, "hello\n");

    const tool = createReadTool();
    const result = await tool.execute({ filePath }, ctx);

    expect(result.output).toContain("End of file");
  });

  it("should report total lines in metadata", async () => {
    const filePath = join(testDir, "test.txt");
    await writeFile(filePath, "a\nb\nc\n");

    const tool = createReadTool();
    const result = await tool.execute({ filePath }, ctx);

    expect(result.metadata?.totalLines).toBe(4); // includes trailing empty line after \n
  });
});
