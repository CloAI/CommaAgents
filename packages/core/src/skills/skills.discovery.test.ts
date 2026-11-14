import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSkills } from "./skills.loader";
import { findCommaProjectRoot } from "../defaults/defaults";
import { parseSkillFile } from "./skills.utils";
import { SKILL_MAX_BYTES } from "./skills.constants";

let workspace: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "comma-discovery-"));
});
afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});
async function skill(
  root: string,
  folder: string,
  name: string,
  body = "Instructions",
  filename = "SKILL.md",
) {
  const directory = join(root, folder);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, filename),
    `---\nname: ${name}\ndescription: Review ${name} changes.\n---\n${body}`,
  );
}

describe("skill discovery snapshots", () => {
  it("should use YAML scalars and ignore nested metadata without altering the Markdown body", () => {
    const parsed = parseSkillFile(
      "---\nname: review\ndescription: >\n  Review code\n  for correctness.\nmetadata:\n  owner: team\nallowed-tools:\n  - read_file\n---\n# Body\nKeep this.\n",
    );
    expect(parsed.metadata).toEqual({
      name: "review",
      description: "Review code for correctness.",
    });
    expect(parsed.body).toBe("# Body\nKeep this.\n");
    expect(() =>
      parseSkillFile(
        "---\nname: first\nname: second\ndescription: x\n---\nBody",
      ),
    ).toThrow("invalid YAML");
  });
  it("should discover the nearest .comma project without Git and merge all roots", async () => {
    const project = join(workspace, "project");
    const globals = join(workspace, "global");
    const first = join(workspace, "first");
    const last = join(workspace, "last");
    await skill(globals, "shared", "shared", "Global");
    await skill(globals, "global-only", "global-only");
    await skill(first, "shared", "shared", "First");
    await skill(last, "shared", "shared", "Last");
    await skill(last, "extra-only", "extra-only");
    await skill(
      join(project, ".comma", "skills"),
      "project-only",
      "project-only",
    );
    const cwd = join(project, "packages", "ui");
    await mkdir(cwd, { recursive: true });
    const result = await loadSkills(cwd, {
      globalSkillsDir: globals,
      additionalDirectories: [first, last],
    });
    expect(result.projectRoot).toBe(project);
    expect(result.registry.list().map((entry) => entry.name)).toEqual([
      "extra-only",
      "global-only",
      "project-only",
      "shared",
    ]);
    expect(result.registry.get("shared")?.content).toBe("Last");
    expect(
      result.warnings.filter((warning) => warning.code === "SKILL_SHADOWED"),
    ).toHaveLength(2);
  });
  it("should prefer a project conflict and resolve relative sources against the workspace", async () => {
    await skill(join(workspace, "extra"), "shared", "shared", "Extra");
    await skill(
      join(workspace, ".comma", "skills"),
      "shared",
      "shared",
      "Project",
    );
    const result = await loadSkills(workspace, {
      globalSkillsDir: null,
      additionalDirectories: ["./extra"],
    });
    expect(result.registry.get("shared")).toMatchObject({
      content: "Project",
      origin: "project",
    });
    expect(result.warnings[0]?.code).toBe("SKILL_SHADOWED");
  });
  it("should follow outside directory links, deduplicate root aliases and diagnose broken links", async () => {
    const external = join(workspace, "external");
    await skill(external, "review", "review");
    const projectSkills = join(workspace, ".comma", "skills");
    await mkdir(projectSkills, { recursive: true });
    await symlink(
      join(external, "review"),
      join(projectSkills, "linked"),
      "dir",
    );
    await symlink(
      join(workspace, "missing"),
      join(projectSkills, "broken"),
      "dir",
    );
    await symlink(projectSkills, join(workspace, "alias"), "dir");
    const result = await loadSkills(workspace, {
      globalSkillsDir: null,
      additionalDirectories: ["./alias"],
    });
    expect(result.registry.list()).toHaveLength(1);
    expect(result.registry.get("review")?.origin).toBe("project");
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "BROKEN_SYMLINK" }),
    ]);
  });
  it("should accept SKILL.MD while ignoring deeper nested skills", async () => {
    const root = join(workspace, ".comma", "skills");
    await skill(root, "upper", "upper", "Upper", "SKILL.MD");
    await skill(join(root, "group"), "deep", "deep");
    const result = await loadSkills(workspace, { globalSkillsDir: null });
    expect(result.registry.list().map((entry) => entry.name)).toEqual([
      "upper",
    ]);
  });
  it("should prefer SKILL.md when a case-sensitive source contains both names", async () => {
    const root = join(workspace, ".comma", "skills");
    await skill(root, "both", "preferred", "Preferred");
    await skill(root, "both", "alternate", "Alternate", "SKILL.MD");
    const { readdir } = await import("node:fs/promises");
    const filenames = await readdir(join(root, "both"));
    const result = await loadSkills(workspace, { globalSkillsDir: null });
    if (filenames.includes("SKILL.md") && filenames.includes("SKILL.MD")) {
      expect(result.registry.get("preferred")).toBeDefined();
      expect(result.warnings[0]?.code).toBe("DUPLICATE_FILENAME");
    } else {
      expect(result.registry.list()).toHaveLength(1);
    }
  });
  it("should skip malformed and oversized files while preserving healthy skills", async () => {
    const root = join(workspace, ".comma", "skills");
    await skill(root, "healthy", "healthy");
    await skill(root, "large", "large", "x".repeat(SKILL_MAX_BYTES + 1));
    await skill(root, "invalid", "invalid");
    await writeFile(join(root, "invalid", "SKILL.md"), "Not frontmatter");
    const result = await loadSkills(workspace, { globalSkillsDir: null });
    expect(result.registry.list().map((entry) => entry.name)).toEqual([
      "healthy",
    ]);
    expect(result.warnings.map((warning) => warning.code).sort()).toEqual([
      "INVALID_SKILL",
      "SKILL_TOO_LARGE",
    ]);
  });
  it("should continue without a project and never create .comma during discovery", async () => {
    const { existsSync } = await import("node:fs");
    const globals = join(workspace, "global");
    await skill(globals, "shared", "shared");
    const result = await loadSkills(workspace, { globalSkillsDir: globals });
    expect(findCommaProjectRoot(workspace)).toBeUndefined();
    expect(result.projectRoot).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.registry.list()).toHaveLength(1);
    expect(existsSync(join(workspace, ".comma"))).toBe(false);
  });
});
