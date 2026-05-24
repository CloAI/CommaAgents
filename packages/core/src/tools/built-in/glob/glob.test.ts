import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  result: Awaited<ReturnType<ReturnType<typeof createGlobTool>["execute"]>>,
): Promise<GlobData> {
  if (!result.ok) {
    throw new Error(
      `expected ok, got error: ${result.error?.kind} ${result.error?.message}`,
    );
  }
  if (!result.data) throw new Error("expected data");
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
      makePrimaryContext({ jail: true }),
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
});
