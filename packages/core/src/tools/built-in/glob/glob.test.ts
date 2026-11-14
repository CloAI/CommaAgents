import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import { createGlobTool, type GlobData } from "./index";

let workspaceRoot: string;
let outsideRoot: string;

beforeEach(async () => {
  const base = realpathSync(tmpdir());
  workspaceRoot = await mkdtemp(join(base, "glob-ws-"));
  outsideRoot = await mkdtemp(join(base, "glob-outside-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
});

function makePrimaryContext(overrides?: {
  outsideWorkspace?: "allow" | "deny";
  absolutePaths?: "allow" | "deny";
  forbiddenGlobs?: readonly string[];
}): ToolContext {
  return makeToolContext({
    sandbox: createSandbox({
      cwd: workspaceRoot,
      outsideWorkspace: overrides?.outsideWorkspace ?? "deny",
      absolutePaths: overrides?.absolutePaths ?? "deny",
      forbiddenGlobs: overrides?.forbiddenGlobs ?? [],
    }),
  });
}

async function getOk(
  result: Awaited<ReturnType<ReturnType<typeof createGlobTool>["execute"]>>,
): Promise<GlobData> {
  if (!result.ok) {
    throw new Error(
      `expected ok, got error: ${result.error?.kind} ${result.error?.message}`,
    );
  }
  if (!result.data) {
    throw new Error("expected data");
  }
  return result.data;
}

describe("createGlobTool", () => {
  it("returns a tool definition", () => {
    const tool = createGlobTool();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("finds matching files", async () => {
    await writeFile(join(workspaceRoot, "a.txt"), "a");
    await writeFile(join(workspaceRoot, "b.json"), "b");
    await mkdir(join(workspaceRoot, "sub"));
    await writeFile(join(workspaceRoot, "sub", "c.txt"), "c");

    const tool = createGlobTool();
    const data = await getOk(
      await tool.execute({ pattern: "**/*.txt" }, makePrimaryContext()),
    );

    const paths = data.matches.map((m) => m.path).sort();
    expect(paths).toEqual(["a.txt", "sub/c.txt"]);
  });

  it("finds matching folders", async () => {
    await mkdir(join(workspaceRoot, "src-folder"));
    await mkdir(join(workspaceRoot, "test-folder"));

    const tool = createGlobTool();
    const data = await getOk(
      await tool.execute({ pattern: "*-folder" }, makePrimaryContext()),
    );

    const paths = data.matches.map((m) => m.path).sort();
    expect(paths).toEqual(["src-folder", "test-folder"]);
    expect(data.matches.every((m) => m.type === "directory")).toBe(true);
  });

  it("finds both matching files and folders", async () => {
    await mkdir(join(workspaceRoot, "foo"));
    await writeFile(join(workspaceRoot, "foo.txt"), "foo text");

    const tool = createGlobTool();
    const data = await getOk(
      await tool.execute({ pattern: "foo*" }, makePrimaryContext()),
    );

    const paths = data.matches.map((m) => m.path).sort();
    expect(paths).toEqual(["foo", "foo.txt"]);

    const fooMatch = data.matches.find((m) => m.path === "foo");
    const fooTxtMatch = data.matches.find((m) => m.path === "foo.txt");

    expect(fooMatch?.type).toBe("directory");
    expect(fooTxtMatch?.type).toBe("file");
  });

  it("respects excludeGlobs", async () => {
    await writeFile(join(workspaceRoot, "a.txt"), "a");
    await mkdir(join(workspaceRoot, "node_modules"));
    await writeFile(join(workspaceRoot, "node_modules", "b.txt"), "b");

    const tool = createGlobTool();
    const data = await getOk(
      await tool.execute({ pattern: "**/*.txt" }, makePrimaryContext()),
    );

    const paths = data.matches.map((m) => m.path).sort();
    expect(paths).toEqual(["a.txt"]);
  });

  it("filters out forbidden globs silently", async () => {
    await writeFile(join(workspaceRoot, "public.txt"), "public");
    await writeFile(join(workspaceRoot, "secret.txt"), "secret");

    const tool = createGlobTool();
    const data = await getOk(
      await tool.execute(
        { pattern: "*.txt" },
        makePrimaryContext({ forbiddenGlobs: ["**/secret.txt"] }),
      ),
    );

    const paths = data.matches.map((m) => m.path).sort();
    expect(paths).toEqual(["public.txt"]);
  });

  it("returns not_found when the root does not exist", async () => {
    const tool = createGlobTool();
    const result = await tool.execute(
      { pattern: "*.ts", root: "nope" },
      makePrimaryContext(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("rejects paths outside workspace", async () => {
    const tool = createGlobTool();
    const result = await tool.execute(
      { pattern: "*.ts", root: "../../etc" },
      makePrimaryContext({ outsideWorkspace: "deny" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("outside_workspace");
  });

  it("truncates matches when exceeding maxResults", async () => {
    for (let i = 0; i < 5; i++) {
      await writeFile(join(workspaceRoot, `f${i}.txt`), "");
    }
    const tool = createGlobTool({ maxResults: 3 });
    const data = await getOk(
      await tool.execute({ pattern: "*.txt" }, makePrimaryContext()),
    );
    expect(data.matches.length).toBe(3);
    expect(data.truncated).toBe(true);
  });

  it("should list immediate children without an incomplete depth warning", async () => {
    await mkdir(join(workspaceRoot, "src", "nested"), { recursive: true });
    await writeFile(join(workspaceRoot, "src", "nested", "file.ts"), "");
    const data = await getOk(
      await createGlobTool().execute({ pattern: "*" }, makePrimaryContext()),
    );
    expect(data).toEqual({
      matches: [{ path: "src", type: "directory" }],
      truncated: false,
      incompleteReasons: [],
    });
  });

  it("should match and exclude relative to a nested root and return workspace paths", async () => {
    await mkdir(join(workspaceRoot, "src", "nested"), { recursive: true });
    await writeFile(join(workspaceRoot, "src", "a.ts"), "");
    await writeFile(join(workspaceRoot, "src", "nested", "b.ts"), "");
    const data = await getOk(
      await createGlobTool().execute(
        { pattern: "**/*.ts", root: "src", excludeGlobs: ["nested/**"] },
        makePrimaryContext(),
      ),
    );
    expect(data.matches).toEqual([{ path: "src/a.ts", type: "file" }]);
  });

  it("should include hidden entries and report symlinks without following them", async () => {
    await mkdir(join(workspaceRoot, ".hidden"));
    await writeFile(join(workspaceRoot, ".hidden", "a.ts"), "");
    await writeFile(join(outsideRoot, "secret.ts"), "");
    await symlink(join(workspaceRoot, ".hidden"), join(workspaceRoot, "link"));
    const data = await getOk(
      await createGlobTool().execute({ pattern: "**/*" }, makePrimaryContext()),
    );
    expect(data.matches).toEqual([
      { path: ".hidden", type: "directory" },
      { path: "link", type: "symlink" },
      { path: ".hidden/a.ts", type: "file" },
    ]);
  });

  it("should prune guard-blocked directories before visiting their children", async () => {
    await mkdir(join(workspaceRoot, "secret"));
    await writeFile(join(workspaceRoot, "secret", "visible.ts"), "");
    const data = await getOk(
      await createGlobTool().execute(
        { pattern: "**/*.ts" },
        makePrimaryContext({ forbiddenGlobs: ["**/secret"] }),
      ),
    );
    expect(data).toEqual({
      matches: [],
      truncated: false,
      incompleteReasons: [],
    });
  });

  it("should report depth and output limits explicitly", async () => {
    await mkdir(join(workspaceRoot, "nested"));
    await writeFile(join(workspaceRoot, "nested", "a.ts"), "");
    const depth = await getOk(
      await createGlobTool({ maxDepth: 1 }).execute(
        { pattern: "**/*.ts" },
        makePrimaryContext(),
      ),
    );
    expect(depth.incompleteReasons).toEqual(["depth_limit"]);
    for (let index = 0; index < 10; index++) {
      await writeFile(join(workspaceRoot, `${index}-${"a".repeat(80)}.ts`), "");
    }
    const result = await createGlobTool({ maxOutputBytes: 300 }).execute(
      { pattern: "*.ts" },
      makePrimaryContext(),
    );
    expect(result.ok).toBe(true);
    expect(result.data?.incompleteReasons).toContain("output_limit");
    expect(result.output).toContain("output_limit");
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(300);
  });

  it("should abort rather than return successful partial results", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createGlobTool().execute(
        { pattern: "**/*" },
        { ...makePrimaryContext(), abort: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
