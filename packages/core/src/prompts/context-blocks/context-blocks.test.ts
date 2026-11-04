import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProjectInstructions, renderContextBlocks } from "./context-blocks";
import { directoriesBetween, parseGitStatus } from "./context-blocks.utils";

const temporaryDirectories: string[] = [];

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "context-blocks-"));
  temporaryDirectories.push(root);
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "packages", "core"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadProjectInstructions", () => {
  it("should collect one file per directory from the root down to cwd", async () => {
    const root = createRepository();
    writeFileSync(join(root, "AGENTS.md"), "root rules\n");
    writeFileSync(join(root, "packages", "core", "CLAUDE.md"), "core rules");
    const instructions = await loadProjectInstructions(
      join(root, "packages", "core"),
    );
    expect(instructions).toEqual([
      { path: "AGENTS.md", content: "root rules" },
      { path: join("packages", "core", "CLAUDE.md"), content: "core rules" },
    ]);
  });

  it("should prefer the first configured file name in a directory", async () => {
    const root = createRepository();
    writeFileSync(join(root, "AGENTS.md"), "agents");
    writeFileSync(join(root, "CLAUDE.md"), "claude");
    expect(await loadProjectInstructions(root)).toEqual([
      { path: "AGENTS.md", content: "agents" },
    ]);
  });

  it("should skip empty files", async () => {
    const root = createRepository();
    writeFileSync(join(root, "AGENTS.md"), "  \n");
    expect(await loadProjectInstructions(root)).toEqual([]);
  });
});

describe("renderContextBlocks", () => {
  it("should render instructions and environment as tagged blocks", () => {
    const rendered = renderContextBlocks(
      [{ path: "AGENTS.md", content: "Use bun." }],
      {
        cwd: "/repo",
        date: "2026-10-26",
        platform: "linux",
        git: { branch: "main", changed: 2, untracked: 1 },
      },
    );
    expect(rendered).toBe(
      [
        "Project instructions follow. Deeper files override outer ones; the user's direct requests override both.",
        '<project_instructions path="AGENTS.md">\nUse bun.\n</project_instructions>',
        "<environment>\ncwd: /repo\ndate: 2026-10-26\nplatform: linux\ngit: branch main, 2 changed, 1 untracked\n</environment>",
      ].join("\n\n"),
    );
  });

  it("should render nothing when nothing is selected", () => {
    expect(renderContextBlocks([])).toBe("");
  });
});

describe("parseGitStatus", () => {
  it("should read the branch and count changed and untracked paths", () => {
    expect(
      parseGitStatus(
        "## feature/x...origin/feature/x [ahead 1]\n M a.ts\nA  b.ts\n?? c.ts\n",
      ),
    ).toEqual({ branch: "feature/x", changed: 2, untracked: 1 });
  });

  it("should keep dots inside branch names", () => {
    expect(parseGitStatus("## release/1.2...origin/release/1.2\n").branch).toBe(
      "release/1.2",
    );
  });

  it("should report a detached head", () => {
    expect(parseGitStatus("## HEAD (no branch)\n")).toEqual({
      branch: "detached",
      changed: 0,
      untracked: 0,
    });
  });
});

describe("directoriesBetween", () => {
  it("should list directories outermost first", () => {
    expect(directoriesBetween("/repo", "/repo/packages/core")).toEqual([
      "/repo",
      "/repo/packages",
      "/repo/packages/core",
    ]);
  });
});
