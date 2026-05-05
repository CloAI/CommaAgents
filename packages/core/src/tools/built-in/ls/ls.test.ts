// Tests for the ls built-in tool

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeToolContext } from "../../test.utils";
import { createLsTool } from "./ls";

const ctx = makeToolContext();

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "ls-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("createLsTool", () => {
  it("should create a tool with correct description", () => {
    const tool = createLsTool();
    expect(tool.description).toContain("List directory entries");
    expect(typeof tool.execute).toBe("function");
  });

  it("should list a flat directory with size and date columns", async () => {
    await writeFile(join(testDir, "file.txt"), "hello");
    await mkdir(join(testDir, "subdir"));

    const tool = createLsTool();
    const result = await tool.execute({ path: testDir }, ctx);

    expect(result.output).toContain("subdir/");
    expect(result.output).toContain("file.txt");
    expect(result.output).toContain("dir");
    // Size column for the file (5 bytes = "hello")
    expect(result.output).toContain("5 B");
    expect(result.metadata?.entries).toBe(2);
    expect(result.metadata?.recursive).toBe(false);
  });

  it("should sort directories before files, then alphabetically", async () => {
    await writeFile(join(testDir, "a.txt"), "");
    await writeFile(join(testDir, "z.txt"), "");
    await mkdir(join(testDir, "b-dir"));
    await mkdir(join(testDir, "a-dir"));

    const tool = createLsTool();
    const result = await tool.execute({ path: testDir }, ctx);
    const lines = result.output.split("\n");

    // Directories first, alphabetical within each group.
    const aDirIdx = lines.findIndex((line) => line.includes("a-dir/"));
    const bDirIdx = lines.findIndex((line) => line.includes("b-dir/"));
    const aFileIdx = lines.findIndex((line) => line.includes("a.txt"));
    const zFileIdx = lines.findIndex((line) => line.includes("z.txt"));

    expect(aDirIdx).toBeLessThan(bDirIdx);
    expect(bDirIdx).toBeLessThan(aFileIdx);
    expect(aFileIdx).toBeLessThan(zFileIdx);
  });

  it("should hide dotfiles by default", async () => {
    await writeFile(join(testDir, ".hidden"), "");
    await writeFile(join(testDir, "visible"), "");

    const tool = createLsTool();
    const result = await tool.execute({ path: testDir }, ctx);

    expect(result.output).toContain("visible");
    expect(result.output).not.toContain(".hidden");
  });

  it("should include dotfiles when showHidden is true", async () => {
    await writeFile(join(testDir, ".hidden"), "");
    await writeFile(join(testDir, "visible"), "");

    const tool = createLsTool();
    const result = await tool.execute({ path: testDir, showHidden: true }, ctx);

    expect(result.output).toContain(".hidden");
    expect(result.output).toContain("visible");
  });

  it("should not recurse by default", async () => {
    await mkdir(join(testDir, "sub"));
    await writeFile(join(testDir, "sub", "nested.txt"), "");

    const tool = createLsTool();
    const result = await tool.execute({ path: testDir }, ctx);

    expect(result.output).toContain("sub/");
    expect(result.output).not.toContain("nested.txt");
  });

  it("should recurse when requested", async () => {
    await mkdir(join(testDir, "sub"));
    await writeFile(join(testDir, "sub", "nested.txt"), "");
    await mkdir(join(testDir, "sub", "deeper"));
    await writeFile(join(testDir, "sub", "deeper", "leaf.txt"), "");

    const tool = createLsTool();
    const result = await tool.execute({ path: testDir, recursive: true }, ctx);

    expect(result.output).toContain("sub/");
    expect(result.output).toContain("nested.txt");
    expect(result.output).toContain("deeper/");
    expect(result.output).toContain("leaf.txt");
  });

  it("should respect maxDepth when recursive", async () => {
    await mkdir(join(testDir, "level1"));
    await writeFile(join(testDir, "level1", "a.txt"), "");
    await mkdir(join(testDir, "level1", "level2"));
    await writeFile(join(testDir, "level1", "level2", "deep.txt"), "");

    const tool = createLsTool();
    const result = await tool.execute(
      { path: testDir, recursive: true, maxDepth: 1 },
      ctx,
    );

    expect(result.output).toContain("level1/");
    expect(result.output).toContain("a.txt");
    expect(result.output).toContain("level2/");
    // level2's contents are at depth 2 — beyond maxDepth=1.
    expect(result.output).not.toContain("deep.txt");
  });

  it("should indent recursive entries by depth", async () => {
    await mkdir(join(testDir, "outer"));
    await writeFile(join(testDir, "outer", "inner.txt"), "");

    const tool = createLsTool();
    const result = await tool.execute({ path: testDir, recursive: true }, ctx);

    // The nested entry should be indented (two spaces per depth level).
    expect(result.output).toMatch(/\n {2}inner\.txt/);
  });

  it("should return error for non-existent path", async () => {
    const tool = createLsTool();
    const result = await tool.execute({ path: "/nonexistent/dir" }, ctx);

    expect(result.output).toContain("Error");
    expect(result.output).toContain("not found");
    expect(result.metadata?.error).toBe(true);
  });

  it("should return error when path is a file", async () => {
    const filePath = join(testDir, "file.txt");
    await writeFile(filePath, "");

    const tool = createLsTool();
    const result = await tool.execute({ path: filePath }, ctx);

    expect(result.output).toContain("not a directory");
    expect(result.metadata?.error).toBe(true);
  });

  it("should report empty directory", async () => {
    const tool = createLsTool();
    const result = await tool.execute({ path: testDir }, ctx);

    expect(result.output).toContain("Empty directory");
    expect(result.metadata?.entries).toBe(0);
  });

  it("should truncate at maxEntries and mark metadata.truncated", async () => {
    for (let entryIndex = 0; entryIndex < 10; entryIndex++) {
      await writeFile(join(testDir, `f${entryIndex}.txt`), "");
    }

    const tool = createLsTool({ maxEntries: 3 });
    const result = await tool.execute({ path: testDir }, ctx);

    expect(result.metadata?.truncated).toBe(true);
    expect(result.metadata?.entries).toBe(3);
    expect(result.output).toContain("Truncated at 3 entries");
  });

  it("should format size in human-readable units", async () => {
    // 2 KiB file — should render as "2.0 KB".
    await writeFile(join(testDir, "k.bin"), Buffer.alloc(2048));

    const tool = createLsTool();
    const result = await tool.execute({ path: testDir }, ctx);

    expect(result.output).toContain("2.0 KB");
  });
});
