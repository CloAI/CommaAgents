import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import { createSearchFilesTool, type SearchFilesData } from "./index";

let workspaceRoot: string;

beforeEach(async () => {
  const base = realpathSync(tmpdir());
  workspaceRoot = await mkdtemp(join(base, "search-files-ws-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

function makeCtx(overrides?: {
  jail?: boolean;
  allowAbsolutePaths?: boolean;
  forbiddenGlobs?: readonly string[];
}): ToolContext {
  return makeToolContext({
    sandbox: createSandbox({
      cwd: workspaceRoot,
      jail: overrides?.jail ?? true,
      allowAbsolutePaths: overrides?.allowAbsolutePaths ?? false,
      forbiddenGlobs: overrides?.forbiddenGlobs ?? [],
    }),
  });
}

async function getOk(
  result: Awaited<
    ReturnType<ReturnType<typeof createSearchFilesTool>["execute"]>
  >,
): Promise<SearchFilesData> {
  if (!result.ok) {
    throw new Error(
      `expected ok, got error: ${result.error?.kind} ${result.error?.message}`,
    );
  }
  if (!result.data) throw new Error("expected data");
  return result.data;
}

describe("createSearchFilesTool", () => {
  it("returns a tool definition", () => {
    const tool = createSearchFilesTool();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("path mode: matches files via Bun.Glob relative to root", async () => {
    await mkdir(join(workspaceRoot, "src"));
    await writeFile(join(workspaceRoot, "src", "a.ts"), "");
    await writeFile(join(workspaceRoot, "src", "b.ts"), "");
    await writeFile(join(workspaceRoot, "README.md"), "");

    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute({ mode: "path", query: "**/*.ts" }, makeCtx()),
    );

    const paths = data.matches.map((m) => m.path).sort();
    expect(paths).toEqual(["src/a.ts", "src/b.ts"]);
    expect(data.truncated).toBe(false);
  });

  it("path mode: matches relative to a non-root search root", async () => {
    await mkdir(join(workspaceRoot, "src", "nested"), { recursive: true });
    await writeFile(join(workspaceRoot, "src", "nested", "x.ts"), "");
    await writeFile(join(workspaceRoot, "other.ts"), "");

    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute(
        { mode: "path", query: "nested/*.ts", root: "src" },
        makeCtx(),
      ),
    );

    expect(data.matches.map((m) => m.path)).toEqual(["src/nested/x.ts"]);
  });

  it("text mode: finds literal substrings with line and column", async () => {
    await writeFile(
      join(workspaceRoot, "a.txt"),
      "first line\nhello world\nlast line\n",
    );

    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute({ mode: "text", query: "hello" }, makeCtx()),
    );

    expect(data.matches.length).toBe(1);
    const m = data.matches[0]!;
    expect(m.path).toBe("a.txt");
    expect(m.line).toBe(2);
    expect(m.column).toBe(1);
    expect(m.preview).toContain("hello world");
  });

  it("text mode: contextLines includes surrounding lines", async () => {
    await writeFile(
      join(workspaceRoot, "a.txt"),
      "line1\nline2\nNEEDLE\nline4\nline5\n",
    );

    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute(
        { mode: "text", query: "NEEDLE", contextLines: 1 },
        makeCtx(),
      ),
    );

    expect(data.matches.length).toBe(1);
    const preview = data.matches[0]!.preview;
    expect(preview).toContain("line2");
    expect(preview).toContain("NEEDLE");
    expect(preview).toContain("line4");
    expect(preview).not.toContain("line1");
    expect(preview).not.toContain("line5");
  });

  it("text mode: is case-sensitive", async () => {
    await writeFile(join(workspaceRoot, "a.txt"), "Hello\nhello\nHELLO\n");

    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute({ mode: "text", query: "hello" }, makeCtx()),
    );
    expect(data.matches.length).toBe(1);
    expect(data.matches[0]!.line).toBe(2);
  });

  it("regex mode: matches with the m flag (line anchors)", async () => {
    await writeFile(join(workspaceRoot, "a.txt"), "alpha\nbeta\ngamma\n");

    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute({ mode: "regex", query: "^beta$" }, makeCtx()),
    );

    expect(data.matches.length).toBe(1);
    expect(data.matches[0]!.line).toBe(2);
    expect(data.matches[0]!.column).toBe(1);
  });

  it("regex mode: returns command_failed for invalid regex", async () => {
    const tool = createSearchFilesTool();
    const result = await tool.execute(
      { mode: "regex", query: "[unclosed" },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
    expect(result.error?.message).toContain("Invalid regex");
  });

  it("respects includeGlobs", async () => {
    await writeFile(join(workspaceRoot, "a.ts"), "needle");
    await writeFile(join(workspaceRoot, "b.md"), "needle");

    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute(
        { mode: "text", query: "needle", includeGlobs: ["**/*.ts"] },
        makeCtx(),
      ),
    );
    expect(data.matches.map((m) => m.path)).toEqual(["a.ts"]);
  });

  it("respects custom excludeGlobs (overrides defaults)", async () => {
    await mkdir(join(workspaceRoot, "skipme"));
    await writeFile(join(workspaceRoot, "skipme", "x.txt"), "needle");
    await writeFile(join(workspaceRoot, "ok.txt"), "needle");

    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute(
        {
          mode: "text",
          query: "needle",
          excludeGlobs: ["**/skipme/**"],
        },
        makeCtx(),
      ),
    );

    const paths = data.matches.map((m) => m.path).sort();
    expect(paths).toEqual(["ok.txt"]);
  });

  it("excludes node_modules and .git by default", async () => {
    await mkdir(join(workspaceRoot, "node_modules"));
    await writeFile(join(workspaceRoot, "node_modules", "x.txt"), "needle");
    await mkdir(join(workspaceRoot, ".git"));
    await writeFile(join(workspaceRoot, ".git", "config"), "needle");
    await writeFile(join(workspaceRoot, "ok.txt"), "needle");

    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute({ mode: "text", query: "needle" }, makeCtx()),
    );

    const paths = data.matches.map((m) => m.path).sort();
    expect(paths).toEqual(["ok.txt"]);
  });

  it("skips binary files in text/regex modes", async () => {
    const buf = new Uint8Array(64);
    buf[0] = 0x00;
    await writeFile(join(workspaceRoot, "bin.dat"), buf);
    await writeFile(join(workspaceRoot, "text.txt"), "needle\n");

    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute({ mode: "text", query: "needle" }, makeCtx()),
    );

    expect(data.matches.map((m) => m.path)).toEqual(["text.txt"]);
  });

  it("filters out files matching forbiddenGlobs", async () => {
    await writeFile(join(workspaceRoot, "ok.txt"), "needle");
    await writeFile(join(workspaceRoot, "secret.env"), "needle");

    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute(
        { mode: "text", query: "needle" },
        makeCtx({ forbiddenGlobs: ["**/*.env"] }),
      ),
    );

    const paths = data.matches.map((m) => m.path);
    expect(paths).toContain("ok.txt");
    expect(paths).not.toContain("secret.env");
  });

  it("rejects path traversal in root with outside_workspace", async () => {
    const tool = createSearchFilesTool();
    const result = await tool.execute(
      { mode: "text", query: "x", root: "../../etc" },
      makeCtx({ jail: true }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("outside_workspace");
  });

  it("returns not_found when root does not exist", async () => {
    const tool = createSearchFilesTool();
    const result = await tool.execute(
      { mode: "text", query: "x", root: "does-not-exist" },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("returns not_found when root is a file", async () => {
    await writeFile(join(workspaceRoot, "f.txt"), "x");
    const tool = createSearchFilesTool();
    const result = await tool.execute(
      { mode: "text", query: "x", root: "f.txt" },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("truncates when matches exceed maxResults", async () => {
    for (let i = 0; i < 5; i++) {
      await writeFile(join(workspaceRoot, `f${i}.txt`), "needle\n");
    }
    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute(
        { mode: "text", query: "needle", maxResults: 3 },
        makeCtx(),
      ),
    );
    expect(data.matches.length).toBe(3);
    expect(data.truncated).toBe(true);
  });

  it("clamps maxResults to the factory cap", async () => {
    for (let i = 0; i < 5; i++) {
      await writeFile(join(workspaceRoot, `f${i}.txt`), "needle\n");
    }
    const tool = createSearchFilesTool({ maxResults: 2 });
    const data = await getOk(
      await tool.execute(
        { mode: "text", query: "needle", maxResults: 999 },
        makeCtx(),
      ),
    );
    expect(data.matches.length).toBe(2);
    expect(data.truncated).toBe(true);
  });

  it("returns early when the abort signal fires", async () => {
    for (let i = 0; i < 3; i++) {
      await writeFile(join(workspaceRoot, `f${i}.txt`), "needle\n");
    }
    const controller = new AbortController();
    controller.abort();
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspaceRoot, jail: true }),
      abort: controller.signal,
    });

    const tool = createSearchFilesTool();
    const data = await getOk(
      await tool.execute({ mode: "text", query: "needle" }, toolContext),
    );
    expect(data.matches.length).toBe(0);
  });
});
