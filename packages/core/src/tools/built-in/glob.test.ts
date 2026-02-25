// Tests for the glob built-in tool

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolContext } from "../tool";
import { createGlobTool } from "./glob";

const ctx: ToolContext = {
  agentName: "test-agent",
  abort: AbortSignal.timeout(5000),
};

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "glob-test-"));

  // Create test file structure
  await mkdir(join(testDir, "src"), { recursive: true });
  await mkdir(join(testDir, "src", "utils"), { recursive: true });
  await writeFile(join(testDir, "src", "index.ts"), "export {}");
  await writeFile(join(testDir, "src", "app.ts"), "const app = 1;");
  await writeFile(join(testDir, "src", "utils", "helpers.ts"), "export {}");
  await writeFile(join(testDir, "README.md"), "# Test");
  await writeFile(join(testDir, "package.json"), "{}");
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("createGlobTool", () => {
  it("should create a tool with correct description", () => {
    const tool = createGlobTool();
    expect(tool.description).toContain("glob pattern");
    expect(typeof tool.execute).toBe("function");
  });

  it("should find TypeScript files", async () => {
    const tool = createGlobTool();
    const result = await tool.execute({ pattern: "**/*.ts", path: testDir }, ctx);

    expect(result.output).toContain("index.ts");
    expect(result.output).toContain("app.ts");
    expect(result.output).toContain("helpers.ts");
    expect(result.output).not.toContain("README.md");
  });

  it("should find files in a subdirectory", async () => {
    const tool = createGlobTool();
    const result = await tool.execute({ pattern: "src/utils/**/*.ts", path: testDir }, ctx);

    expect(result.output).toContain("helpers.ts");
    expect(result.output).not.toContain("index.ts");
  });

  it("should handle no matches", async () => {
    const tool = createGlobTool();
    const result = await tool.execute({ pattern: "**/*.xyz", path: testDir }, ctx);

    expect(result.output).toContain("No files found");
    expect(result.metadata?.matchCount).toBe(0);
  });

  it("should cap results at maxResults", async () => {
    const tool = createGlobTool({ maxResults: 2 });
    const result = await tool.execute({ pattern: "**/*", path: testDir }, ctx);

    // Should contain the cap message
    expect(result.output).toContain("capped at 2");
  });

  it("should report match count in metadata", async () => {
    const tool = createGlobTool();
    const result = await tool.execute({ pattern: "**/*.ts", path: testDir }, ctx);

    expect(result.metadata?.matchCount).toBe(3);
  });
});
