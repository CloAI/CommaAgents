// Tests for the edit built-in tool

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeToolContext } from "../../test.utils";
import { createEditTool } from "./edit";

const ctx = makeToolContext();

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "edit-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("createEditTool", () => {
  it("should create a tool with correct description", () => {
    const tool = createEditTool();
    expect(tool.description).toContain("Edit a file");
    expect(typeof tool.execute).toBe("function");
  });

  it("should replace a single occurrence", async () => {
    const filePath = join(testDir, "test.txt");
    await writeFile(filePath, "hello world\ngoodbye world\n");

    const tool = createEditTool();
    const result = await tool.execute(
      {
        filePath,
        oldString: "hello world",
        newString: "hi world",
      },
      ctx,
    );

    expect(result.output).toContain("Successfully replaced 1 occurrence");
    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("hi world\ngoodbye world\n");
  });

  it("should error when oldString not found", async () => {
    const filePath = join(testDir, "test.txt");
    await writeFile(filePath, "hello world\n");

    const tool = createEditTool();
    const result = await tool.execute(
      {
        filePath,
        oldString: "not here",
        newString: "replacement",
      },
      ctx,
    );

    expect(result.output).toContain("Error");
    expect(result.output).toContain("not found");
  });

  it("should error on multiple matches without replaceAll", async () => {
    const filePath = join(testDir, "test.txt");
    await writeFile(filePath, "foo bar foo baz foo\n");

    const tool = createEditTool();
    const result = await tool.execute(
      {
        filePath,
        oldString: "foo",
        newString: "qux",
      },
      ctx,
    );

    expect(result.output).toContain("Error");
    expect(result.output).toContain("3 matches");
  });

  it("should replace all occurrences with replaceAll", async () => {
    const filePath = join(testDir, "test.txt");
    await writeFile(filePath, "foo bar foo baz foo\n");

    const tool = createEditTool();
    const result = await tool.execute(
      {
        filePath,
        oldString: "foo",
        newString: "qux",
        replaceAll: true,
      },
      ctx,
    );

    expect(result.output).toContain("Successfully replaced 3 occurrence");
    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("qux bar qux baz qux\n");
  });

  it("should error when oldString equals newString", async () => {
    const filePath = join(testDir, "test.txt");
    await writeFile(filePath, "hello\n");

    const tool = createEditTool();
    const result = await tool.execute(
      {
        filePath,
        oldString: "hello",
        newString: "hello",
      },
      ctx,
    );

    expect(result.output).toContain("Error");
    expect(result.output).toContain("identical");
  });

  it("should error for non-existent file", async () => {
    const tool = createEditTool();
    const result = await tool.execute(
      {
        filePath: join(testDir, "nonexistent.txt"),
        oldString: "foo",
        newString: "bar",
      },
      ctx,
    );

    expect(result.output).toContain("Error");
    expect(result.output).toContain("could not read");
  });

  it("should handle multiline replacements", async () => {
    const filePath = join(testDir, "test.txt");
    await writeFile(filePath, "function foo() {\n  return 1;\n}\n");

    const tool = createEditTool();
    const result = await tool.execute(
      {
        filePath,
        oldString: "function foo() {\n  return 1;\n}",
        newString: "function foo() {\n  return 42;\n}",
      },
      ctx,
    );

    expect(result.output).toContain("Successfully replaced");
    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("return 42");
  });

  it("should report replacement count in metadata", async () => {
    const filePath = join(testDir, "test.txt");
    await writeFile(filePath, "a b a b a\n");

    const tool = createEditTool();
    const result = await tool.execute(
      {
        filePath,
        oldString: "a",
        newString: "x",
        replaceAll: true,
      },
      ctx,
    );

    expect(result.metadata?.replacements).toBe(3);
  });
});
