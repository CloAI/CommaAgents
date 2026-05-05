// Tests for the grep built-in tool

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeToolContext } from "../../test.utils";
import { createGrepTool } from "./grep";

const ctx = makeToolContext({ abort: AbortSignal.timeout(10_000) });

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "grep-test-"));

  await mkdir(join(testDir, "src"), { recursive: true });
  await writeFile(
    join(testDir, "src", "main.ts"),
    'function hello() {\n  console.log("hello world");\n}\n\nfunction goodbye() {\n  console.log("goodbye");\n}\n',
  );
  await writeFile(
    join(testDir, "src", "utils.ts"),
    'export function helper() {\n  return "hello";\n}\n',
  );
  await writeFile(join(testDir, "README.md"), "# Hello World\n\nThis is a test project.\n");
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("createGrepTool", () => {
  it("should create a tool with correct description", () => {
    const tool = createGrepTool();
    expect(tool.description).toContain("Search file contents");
    expect(typeof tool.execute).toBe("function");
  });

  it("should find matches across files", async () => {
    const tool = createGrepTool();
    const result = await tool.execute({ pattern: "hello", path: testDir }, ctx);

    expect(result.output).toContain("main.ts");
    expect(result.output).toContain("utils.ts");
    // README.md has "Hello" (capital H), so case-sensitive "hello" won't match it
    expect(result.metadata?.matchingFiles).toBe(2);
  });

  it("should show line numbers for matches", async () => {
    const tool = createGrepTool();
    const result = await tool.execute({ pattern: "function", path: testDir }, ctx);

    // main.ts has function at lines 1 and 5
    expect(result.output).toContain("1:");
    expect(result.output).toContain("5:");
  });

  it("should filter by include pattern", async () => {
    const tool = createGrepTool();
    const result = await tool.execute(
      {
        pattern: "hello",
        path: testDir,
        include: "*.ts",
      },
      ctx,
    );

    expect(result.output).toContain("main.ts");
    expect(result.output).toContain("utils.ts");
    expect(result.output).not.toContain("README.md");
  });

  it("should handle no matches", async () => {
    const tool = createGrepTool();
    const result = await tool.execute(
      {
        pattern: "nonexistent_string_xyz",
        path: testDir,
      },
      ctx,
    );

    expect(result.output).toContain("No matches found");
    expect(result.metadata?.matchCount).toBe(0);
  });

  it("should report invalid regex", async () => {
    const tool = createGrepTool();
    const result = await tool.execute({ pattern: "[invalid", path: testDir }, ctx);

    expect(result.output).toContain("Error");
    expect(result.output).toContain("invalid regex");
  });

  it("should support regex patterns", async () => {
    const tool = createGrepTool();
    const result = await tool.execute(
      {
        pattern: "function\\s+\\w+",
        path: testDir,
      },
      ctx,
    );

    expect(result.output).toContain("function hello");
    expect(result.output).toContain("function goodbye");
    expect(result.output).toContain("function helper");
  });

  it("should report matching file count in metadata", async () => {
    const tool = createGrepTool();
    const result = await tool.execute({ pattern: "hello", path: testDir }, ctx);

    expect(result.metadata?.matchingFiles).toBeGreaterThan(0);
  });
});
