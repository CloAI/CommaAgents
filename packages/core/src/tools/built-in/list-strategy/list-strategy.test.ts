// Tests for `list_strategy`.
//
// The tool delegates entirely to `discoverStrategies()` — these tests
// drive the underlying discovery with a temp cwd so the result is
// deterministic regardless of host configuration.

import { describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeToolContext } from "../../test.utils";
import { createListStrategyTool } from "./list-strategy";

const VALID_STRATEGY = {
  name: "demo",
  version: "1.0.0",
  description: "Demo strategy.",
  agents: {
    talker: { type: "user" as const },
  },
  flow: {
    type: "sequential" as const,
    name: "main",
    steps: [{ agent: "talker" }],
  },
};

function createScratchDir(label: string): string {
  const dir = join(
    tmpdir(),
    `comma-list-strategy-${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("createListStrategyTool", () => {
  it("returns a tool definition with non-empty description", () => {
    const tool = createListStrategyTool();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("returns at least the bundled strategies when run from the workspace", async () => {
    const tool = createListStrategyTool();
    const result = await tool.execute({}, makeToolContext());

    expect(result.ok).toBe(true);
    expect(result.data?.count).toBe(result.data?.strategies.length);
    // The repo ships a "CommaAgents Strategies" project under
    // packages/core/strategies/. Discovery should pick it up.
    expect((result.data?.count ?? 0)).toBeGreaterThan(0);
  });

  it("formats a single discovered cwd strategy with origin + label", async () => {
    const cwd = createScratchDir("formatting");
    const strategiesDir = join(cwd, ".comma", "strategies");
    mkdirSync(strategiesDir, { recursive: true });
    writeFileSync(
      join(strategiesDir, "demo.json"),
      JSON.stringify(VALID_STRATEGY),
      "utf8",
    );

    // We can't pass options to the tool itself (zero-param schema), so we
    // drive cwd via process.chdir() for this test, which is the same
    // resolution discoverStrategies() uses by default.
    const originalCwd = process.cwd();
    process.chdir(cwd);
    try {
      const tool = createListStrategyTool();
      const result = await tool.execute({}, makeToolContext());

      expect(result.ok).toBe(true);
      const cwdEntry = result.data?.strategies.find(
        (s) => s.origin === "cwd" && s.path.endsWith("demo.json"),
      );
      expect(cwdEntry).toBeDefined();
      expect(cwdEntry?.name).toBe("demo");
      expect(cwdEntry?.label).toBe("demo");
      expect(result.output).toContain("demo");
      expect(result.output).toContain("[cwd]");
    } finally {
      process.chdir(originalCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("surfaces invalid strategies as warnings rather than entries", async () => {
    const cwd = createScratchDir("warnings");
    const strategiesDir = join(cwd, ".comma", "strategies");
    mkdirSync(strategiesDir, { recursive: true });
    writeFileSync(
      join(strategiesDir, "bad.json"),
      '{"name":"oops"}',
      "utf8",
    );

    const originalCwd = process.cwd();
    process.chdir(cwd);
    try {
      // process.chdir may resolve symlinks (e.g. macOS /var → /private/var),
      // so compare against the post-chdir resolved path.
      const expectedBadPath = join(
        process.cwd(),
        ".comma",
        "strategies",
        "bad.json",
      );
      const tool = createListStrategyTool();
      const result = await tool.execute({}, makeToolContext());

      expect(result.ok).toBe(true);
      const warning = result.data?.warnings.find(
        (w) => w.path === expectedBadPath,
      );
      expect(warning).toBeDefined();
      const entry = result.data?.strategies.find(
        (s) => s.path === expectedBadPath,
      );
      expect(entry).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
