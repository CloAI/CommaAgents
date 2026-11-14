import { realpathSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSandbox } from "../../../sandbox/sandbox";
import { makeToolContext } from "../../test.utils";
import type { ToolContext, ToolResult } from "../../tool.types";
import { createGrepTool, grepParams } from "./grep";
import type { GrepData } from "./grep.types";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(realpathSync(tmpdir()), "grep-ws-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(workspaceRoot, { recursive: true, force: true });
});

function makeCtx(forbiddenGlobs: readonly string[] = []): ToolContext {
  return makeToolContext({
    sandbox: createSandbox({
      cwd: workspaceRoot,
      outsideWorkspace: "deny",
      absolutePaths: "deny",
      forbiddenGlobs,
    }),
  });
}

function getData(result: ToolResult<GrepData>): GrepData {
  if (!result.ok || !result.data) {
    throw new Error(`Expected successful data: ${JSON.stringify(result)}`);
  }
  return result.data;
}

describe("createGrepTool", () => {
  it("should search literally by default and return only the first match on each line", async () => {
    await writeFile(join(workspaceRoot, "a.ts"), "a.b a.b\naxb\na.b");
    const data = getData(
      await createGrepTool().execute({ query: "a.b" }, makeCtx()),
    );
    expect(data).toEqual({
      matches: [
        { path: "a.ts", line: 1, column: 1, preview: "1: a.b a.b" },
        { path: "a.ts", line: 3, column: 1, preview: "3: a.b" },
      ],
      truncated: false,
      incompleteReasons: [],
    });
  });

  it("should preserve accurate columns with case-insensitive matching", async () => {
    await writeFile(join(workspaceRoot, "a.txt"), "İ HELLO\nhello");
    const data = getData(
      await createGrepTool().execute(
        { query: "hello", ignoreCase: true },
        makeCtx(),
      ),
    );
    expect(data.matches.map(({ line, column }) => ({ line, column }))).toEqual([
      { line: 1, column: 3 },
      { line: 2, column: 1 },
    ]);
    expect(
      getData(await createGrepTool().execute({ query: "HELLO" }, makeCtx()))
        .matches,
    ).toHaveLength(1);
  });

  it("should normalize BOM and CRLF before matching and formatting context", async () => {
    await writeFile(
      join(workspaceRoot, "a.txt"),
      "\uFEFFbefore\r\nHELLO\r\nafter",
    );
    const data = getData(
      await createGrepTool().execute(
        { query: "^hello$", regex: true, ignoreCase: true, contextLines: 1 },
        makeCtx(),
      ),
    );
    expect(data.matches).toEqual([
      {
        path: "a.txt",
        line: 2,
        column: 1,
        preview: "1: before\n2: HELLO\n3: after",
      },
    ]);
  });

  it("should evaluate regex on individual lines", async () => {
    await writeFile(join(workspaceRoot, "a.txt"), "before\nafter");
    const data = getData(
      await createGrepTool().execute(
        { query: "before\\s+after", regex: true },
        makeCtx(),
      ),
    );
    expect(data.matches).toEqual([]);
  });

  it("should return a recoverable error for invalid regex", async () => {
    const result = await createGrepTool().execute(
      { query: "[", regex: true },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
    expect(result.error?.recoverable).toBe(true);
  });

  it("should scope filters to root and return workspace-relative paths", async () => {
    await mkdir(join(workspaceRoot, "src", "skip"), { recursive: true });
    await writeFile(join(workspaceRoot, "outside.ts"), "hello");
    await writeFile(join(workspaceRoot, "src", "a.ts"), "hello");
    await writeFile(join(workspaceRoot, "src", "b.js"), "hello");
    await writeFile(join(workspaceRoot, "src", "skip", "c.ts"), "hello");
    const data = getData(
      await createGrepTool().execute(
        {
          query: "hello",
          root: "src",
          includeGlobs: ["**/*.ts"],
          excludeGlobs: ["skip", "skip/**"],
        },
        makeCtx(),
      ),
    );
    expect(data.matches.map(({ path }) => path)).toEqual(["src/a.ts"]);
  });

  it("should skip binary files and report oversized text files", async () => {
    await writeFile(join(workspaceRoot, "binary"), Buffer.from([0, 104, 105]));
    await writeFile(join(workspaceRoot, "large"), "hello world");
    await writeFile(join(workspaceRoot, "small"), "hi");
    const data = getData(
      await createGrepTool({ maxFileBytes: 4 }).execute(
        { query: "hi" },
        makeCtx(),
      ),
    );
    expect(data.matches.map(({ path }) => path)).toEqual(["small"]);
    expect(data.incompleteReasons).toEqual(["file_too_large"]);
    expect(data.truncated).toBe(true);
  });

  it("should not mark an exact result cap incomplete until another matching line exists", async () => {
    await writeFile(join(workspaceRoot, "a.txt"), "hello\nhello");
    const tool = createGrepTool({ maxResults: 2 });
    expect(
      getData(await tool.execute({ query: "hello" }, makeCtx())).truncated,
    ).toBe(false);
    await writeFile(join(workspaceRoot, "a.txt"), "hello\nhello\nhello");
    const data = getData(
      await tool.execute({ query: "hello", maxResults: 100 }, makeCtx()),
    );
    expect(data.matches).toHaveLength(2);
    expect(data.incompleteReasons).toEqual(["result_limit"]);
  });

  it("should bound complete formatted output including paths, positions, separators, and multibyte context", async () => {
    await writeFile(
      join(workspaceRoot, "a.txt"),
      `${"é".repeat(40)}\n${"é".repeat(40)}\n${"é".repeat(40)}`,
    );
    const result = await createGrepTool({ maxOutputBytes: 220 }).execute(
      { query: "é" },
      makeCtx(),
    );
    expect(getData(result).matches).toHaveLength(1);
    expect(getData(result).incompleteReasons).toEqual(["output_limit"]);
    expect(result.output).toContain("Search incomplete: output_limit");
    expect(Buffer.byteLength(result.output, "utf8")).toBeLessThanOrEqual(220);
  });

  it("should fail explicitly when the host output budget cannot fit the result summary", async () => {
    const tool = createGrepTool({ maxOutputBytes: 3 });
    const empty = await tool.execute({ query: "hello" }, makeCtx());
    expect(empty.ok).toBe(false);
    expect(empty.error?.suggestedNextAction).toContain("maxOutputBytes");
    expect(Buffer.byteLength(empty.output, "utf8")).toBeLessThanOrEqual(3);
    await writeFile(join(workspaceRoot, "a.txt"), "hello");
    const result = await tool.execute({ query: "hello" }, makeCtx());
    expect(result.ok).toBe(false);
    expect(Buffer.byteLength(result.output, "utf8")).toBeLessThanOrEqual(3);
  });

  it.skipIf(process.getuid?.() === 0 || process.platform === "win32")(
    "should report unreadable files while retaining readable matches",
    async () => {
      await writeFile(join(workspaceRoot, "a.txt"), "hello");
      await writeFile(join(workspaceRoot, "b.txt"), "hello");
      await chmod(join(workspaceRoot, "a.txt"), 0);
      const result = await createGrepTool().execute(
        { query: "hello" },
        makeCtx(),
      );
      expect(getData(result).matches.map(({ path }) => path)).toEqual([
        "b.txt",
      ]);
      expect(getData(result).incompleteReasons).toEqual(["unreadable_path"]);
      expect(result.output).toContain("Search incomplete: unreadable_path");
    },
  );

  it("should exclude forbidden paths and avoid following symlinks", async () => {
    await mkdir(join(workspaceRoot, "secret"));
    await writeFile(join(workspaceRoot, "secret", "a.txt"), "hello");
    await symlink(join(workspaceRoot, "secret"), join(workspaceRoot, "link"));
    await writeFile(join(workspaceRoot, "public.txt"), "hello");
    const data = getData(
      await createGrepTool().execute(
        { query: "hello" },
        makeCtx(["secret", "secret/**"]),
      ),
    );
    expect(data.matches.map(({ path }) => path)).toEqual(["public.txt"]);
  });

  it("should fail missing roots and workspace escapes", async () => {
    const tool = createGrepTool();
    expect(
      (await tool.execute({ query: "hello", root: "missing" }, makeCtx())).error
        ?.kind,
    ).toBe("not_found");
    expect(
      (await tool.execute({ query: "hello", root: ".." }, makeCtx())).error
        ?.kind,
    ).toBe("outside_workspace");
  });

  it("should abort instead of returning successful empty results", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createGrepTool().execute(
        { query: "hello" },
        { ...makeCtx(), abort: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("should abort when cancellation arrives after traversal has started", async () => {
    await writeFile(join(workspaceRoot, "a.txt"), "hello");
    const controller = new AbortController();
    const context = makeCtx();
    const canAccess = context.guard.canAccess.bind(context.guard);
    vi.spyOn(context.guard, "canAccess").mockImplementation((request) => {
      controller.abort();
      return canAccess(request);
    });
    await expect(
      createGrepTool().execute(
        { query: "hello" },
        { ...context, abort: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("should report omitted deep paths in both data and model output", async () => {
    await mkdir(join(workspaceRoot, "nested"));
    await writeFile(join(workspaceRoot, "a.txt"), "hello");
    await writeFile(join(workspaceRoot, "nested", "b.txt"), "hello");
    const result = await createGrepTool({ maxDepth: 1 }).execute(
      { query: "hello" },
      makeCtx(),
    );
    expect(getData(result).matches.map(({ path }) => path)).toEqual(["a.txt"]);
    expect(getData(result).incompleteReasons).toEqual(["depth_limit"]);
    expect(result.output).toContain("Search incomplete: depth_limit");
  });

  it("should reject empty queries and invalid bounds", () => {
    expect(grepParams.safeParse({ query: "" }).success).toBe(false);
    expect(grepParams.safeParse({ query: "x", contextLines: -1 }).success).toBe(
      false,
    );
    expect(grepParams.safeParse({ query: "x", maxResults: 0 }).success).toBe(
      false,
    );
    expect(grepParams.safeParse({ query: "x", mode: "path" }).success).toBe(
      false,
    );
    expect(() => createGrepTool({ maxOutputBytes: 0 })).toThrow(
      "positive safe integers",
    );
    expect(() =>
      createGrepTool({ maxFileBytes: Number.POSITIVE_INFINITY }),
    ).toThrow("positive safe integers");
  });
});
