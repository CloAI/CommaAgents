import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import { createListDirectoryTool, type ListDirectoryData } from "./index";

let workspaceRoot: string;
let outsideRoot: string;

beforeEach(async () => {
  const base = realpathSync(tmpdir());
  workspaceRoot = await mkdtemp(join(base, "list-dir-ws-"));
  outsideRoot = await mkdtemp(join(base, "list-dir-outside-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
});

function makePrimaryContext(overrides?: {
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
    ReturnType<ReturnType<typeof createListDirectoryTool>["execute"]>
  >,
): Promise<ListDirectoryData> {
  if (!result.ok) {
    throw new Error(
      `expected ok, got error: ${result.error?.kind} ${result.error?.message}`,
    );
  }
  if (!result.data) throw new Error("expected data");
  return result.data;
}

describe("createListDirectoryTool", () => {
  it("returns a tool definition", () => {
    const tool = createListDirectoryTool();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("lists direct children only by default (depth=1)", async () => {
    await writeFile(join(workspaceRoot, "a.txt"), "a");
    await mkdir(join(workspaceRoot, "sub"));
    await writeFile(join(workspaceRoot, "sub", "nested.txt"), "n");

    const tool = createListDirectoryTool();
    const data = await getOk(
      await tool.execute({ path: "." }, makePrimaryContext()),
    );

    expect(data.maxDepth).toBe(1);
    const names = data.entries.map((e) => e.name).sort();
    expect(names).toEqual(["a.txt", "sub"]);
    // Should NOT include nested.txt at depth=1
    expect(data.entries.find((e) => e.name === "nested.txt")).toBeUndefined();
  });

  it("recurses up to maxDepth when recursive:true", async () => {
    await mkdir(join(workspaceRoot, "a/b/c"), { recursive: true });
    await writeFile(join(workspaceRoot, "a", "1.txt"), "1");
    await writeFile(join(workspaceRoot, "a", "b", "2.txt"), "2");
    await writeFile(join(workspaceRoot, "a", "b", "c", "3.txt"), "3");

    const tool = createListDirectoryTool();
    const data = await getOk(
      await tool.execute(
        { path: ".", recursive: true, maxDepth: 3 },
        makePrimaryContext(),
      ),
    );

    expect(data.maxDepth).toBe(3);
    const rels = data.entries.map((e) => e.relativePath).sort();
    expect(rels).toContain("a");
    expect(rels).toContain("a/1.txt");
    expect(rels).toContain("a/b");
    expect(rels).toContain("a/b/2.txt");
    expect(rels).toContain("a/b/c");
    // depth 4 — should NOT appear
    expect(rels).not.toContain("a/b/c/3.txt");
  });

  it("classifies entry types correctly", async () => {
    await writeFile(join(workspaceRoot, "file.txt"), "x");
    await mkdir(join(workspaceRoot, "dir"));
    await writeFile(join(outsideRoot, "target.txt"), "t");
    await symlink(join(outsideRoot, "target.txt"), join(workspaceRoot, "link"));

    const tool = createListDirectoryTool();
    const data = await getOk(
      await tool.execute({ path: "." }, makePrimaryContext({ jail: false })),
    );

    const byName = new Map(data.entries.map((e) => [e.name, e]));
    expect(byName.get("file.txt")?.type).toBe("file");
    expect(byName.get("dir")?.type).toBe("directory");
    expect(byName.get("link")?.type).toBe("symlink");
    // Symlinks report size 0 regardless of target
    expect(byName.get("link")?.size).toBe(0);
  });

  it("omits hidden entries by default and includes them with includeHidden:true", async () => {
    await writeFile(join(workspaceRoot, "visible.txt"), "v");
    await writeFile(join(workspaceRoot, ".hidden"), "h");

    const tool = createListDirectoryTool();

    const without = await getOk(
      await tool.execute({ path: "." }, makePrimaryContext()),
    );
    expect(without.entries.map((e) => e.name)).toEqual(["visible.txt"]);

    const withHidden = await getOk(
      await tool.execute(
        { path: ".", includeHidden: true },
        makePrimaryContext(),
      ),
    );
    expect(withHidden.entries.map((e) => e.name).sort()).toEqual([
      ".hidden",
      "visible.txt",
    ]);
  });

  it("filters out entries matching forbidden globs", async () => {
    await writeFile(join(workspaceRoot, "ok.txt"), "ok");
    await writeFile(join(workspaceRoot, "secret.env"), "TOKEN=1");

    const tool = createListDirectoryTool();
    const data = await getOk(
      await tool.execute(
        { path: "." },
        makePrimaryContext({ forbiddenGlobs: ["**/*.env"] }),
      ),
    );

    const names = data.entries.map((e) => e.name);
    expect(names).toContain("ok.txt");
    expect(names).not.toContain("secret.env");
  });

  it("sorts deterministically: depth asc, directory < file < symlink, then name asc", async () => {
    await mkdir(join(workspaceRoot, "zdir"));
    await mkdir(join(workspaceRoot, "adir"));
    await writeFile(join(workspaceRoot, "b.txt"), "b");
    await writeFile(join(workspaceRoot, "a.txt"), "a");

    const tool = createListDirectoryTool();
    const data = await getOk(
      await tool.execute({ path: "." }, makePrimaryContext()),
    );
    const names = data.entries.map((e) => e.name);

    // adir, zdir (directories), then a.txt, b.txt (files)
    expect(names).toEqual(["adir", "zdir", "a.txt", "b.txt"]);
  });

  it("returns empty entries for an empty directory", async () => {
    const tool = createListDirectoryTool();
    const data = await getOk(
      await tool.execute({ path: "." }, makePrimaryContext()),
    );
    expect(data.entries).toEqual([]);
  });

  it("returns not_found when the path does not exist", async () => {
    const tool = createListDirectoryTool();
    const result = await tool.execute({ path: "nope" }, makePrimaryContext());
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("returns not_found with read_file hint when path is a file", async () => {
    await writeFile(join(workspaceRoot, "f.txt"), "x");

    const tool = createListDirectoryTool();
    const result = await tool.execute({ path: "f.txt" }, makePrimaryContext());
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
    expect(result.error?.suggestedNextAction).toContain("read_file");
  });

  it("rejects path traversal with outside_workspace", async () => {
    const tool = createListDirectoryTool();
    const result = await tool.execute(
      { path: "../../etc" },
      makePrimaryContext({ jail: true }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("outside_workspace");
  });

  it("rejects absolute paths when allowAbsolutePaths is false", async () => {
    const tool = createListDirectoryTool();
    const result = await tool.execute(
      { path: workspaceRoot },
      makePrimaryContext({ allowAbsolutePaths: false }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("outside_workspace");
  });

  it("clamps maxDepth to the absolute cap", async () => {
    const tool = createListDirectoryTool({ absoluteMaxDepth: 2 });
    const data = await getOk(
      await tool.execute(
        { path: ".", recursive: true, maxDepth: 999 },
        makePrimaryContext(),
      ),
    );
    expect(data.maxDepth).toBe(2);
  });

  it("truncates when the entry count exceeds maxEntries", async () => {
    for (let i = 0; i < 5; i++) {
      await writeFile(join(workspaceRoot, `f${i}.txt`), "");
    }
    const tool = createListDirectoryTool({ maxEntries: 3 });
    const data = await getOk(
      await tool.execute({ path: "." }, makePrimaryContext()),
    );
    expect(data.entries.length).toBe(3);
    expect(data.truncated).toBe(true);
  });
});
