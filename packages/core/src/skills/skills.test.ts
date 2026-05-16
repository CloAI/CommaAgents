import { describe, expect, it } from "bun:test";

import { buildSkillsPromptHeader, loadSkills } from "./skills.loader";
import { createSkillRegistry } from "./skills.registry";
import { parseSkillFile } from "./skills.utils";
import { createSkillsWorkspace, writeSkillFile } from "./test.utils";

describe("parseSkillFile", () => {
  it("should extract frontmatter and body", () => {
    const raw = [
      "---",
      "name: ts-patterns",
      "description: TypeScript rules.",
      "---",
      "",
      "# Body",
      "Hello",
    ].join("\n");
    const parsed = parseSkillFile(raw);
    expect(parsed.metadata).toEqual({
      name: "ts-patterns",
      description: "TypeScript rules.",
    });
    expect(parsed.body).toBe("# Body\nHello");
  });

  it("should support quoted description values", () => {
    const raw = [
      "---",
      "name: my-skill",
      'description: "Use this when working with: APIs."',
      "---",
      "Body",
    ].join("\n");
    const parsed = parseSkillFile(raw);
    expect(parsed.metadata.description).toBe(
      "Use this when working with: APIs.",
    );
  });

  it("should reject missing frontmatter", () => {
    expect(() => parseSkillFile("# No frontmatter here")).toThrow(
      /missing required YAML frontmatter/,
    );
  });

  it("should reject missing name", () => {
    const raw = ["---", "description: x", "---", "Body"].join("\n");
    expect(() => parseSkillFile(raw)).toThrow(/non-empty `name`/);
  });

  it("should reject missing description", () => {
    const raw = ["---", "name: foo", "---", "Body"].join("\n");
    expect(() => parseSkillFile(raw)).toThrow(/non-empty `description`/);
  });

  it("should reject names that aren't kebab-case", () => {
    const raw = ["---", "name: My_Skill", "description: x", "---", "Body"].join(
      "\n",
    );
    expect(() => parseSkillFile(raw)).toThrow(/kebab-case/);
  });

  it("should reject YAML list values appearing as bare items", () => {
    const raw = [
      "---",
      "name: foo",
      "description: x",
      "- one",
      "---",
      "Body",
    ].join("\n");
    expect(() => parseSkillFile(raw)).toThrow(/does not support YAML lists/);
  });
});

describe("createSkillRegistry", () => {
  it("should sort listed skills by name", () => {
    const registry = createSkillRegistry();
    registry.register({
      name: "zeta",
      description: "z",
      content: "",
      sourcePath: "/z",
      origin: "global",
    });
    registry.register({
      name: "alpha",
      description: "a",
      content: "",
      sourcePath: "/a",
      origin: "global",
    });
    expect(registry.list().map((skill) => skill.name)).toEqual([
      "alpha",
      "zeta",
    ]);
  });

  it("should let project skills override global ones regardless of order", () => {
    const registry = createSkillRegistry();
    registry.register({
      name: "shared",
      description: "project version",
      content: "project",
      sourcePath: "/p",
      origin: "project",
    });
    registry.register({
      name: "shared",
      description: "global version",
      content: "global",
      sourcePath: "/g",
      origin: "global",
    });
    expect(registry.get("shared")?.content).toBe("project");
  });
});

describe("loadSkills", () => {
  it("should load both global and project skills, with project overriding global", async () => {
    const { workspaceRoot, globalDir, projectDir } =
      await createSkillsWorkspace("override");
    await writeSkillFile(
      globalDir,
      "shared",
      { name: "shared", description: "global one" },
      "global body",
    );
    await writeSkillFile(
      globalDir,
      "global-only",
      { name: "global-only", description: "g" },
      "g body",
    );
    await writeSkillFile(
      projectDir,
      "shared",
      { name: "shared", description: "project one" },
      "project body",
    );
    await writeSkillFile(
      projectDir,
      "project-only",
      { name: "project-only", description: "p" },
      "p body",
    );

    const { registry, warnings } = await loadSkills(workspaceRoot, {
      globalSkillsDir: globalDir,
      projectSkillsDir: projectDir,
    });
    expect(warnings).toEqual([]);
    expect(registry.list().map((skill) => skill.name)).toEqual([
      "global-only",
      "project-only",
      "shared",
    ]);
    expect(registry.get("shared")?.origin).toBe("project");
    expect(registry.get("shared")?.content).toBe("project body");
  });

  it("should silently skip missing directories", async () => {
    const { workspaceRoot } = await createSkillsWorkspace("missing");
    const result = await loadSkills(workspaceRoot, {
      globalSkillsDir: "/definitely/does/not/exist",
      projectSkillsDir: "/also/does/not/exist",
    });
    expect(result.registry.isEmpty()).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("should surface malformed skill files as warnings", async () => {
    const { workspaceRoot, projectDir } =
      await createSkillsWorkspace("malformed");
    await writeSkillFile(
      projectDir,
      "bad-skill",
      { description: "missing name" },
      "body",
    );
    const result = await loadSkills(workspaceRoot, {
      globalSkillsDir: null,
      projectSkillsDir: projectDir,
    });
    expect(result.registry.isEmpty()).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.message).toMatch(/`name`/);
  });

  it("should ignore subdirectories without a SKILL.md", async () => {
    const { workspaceRoot, projectDir } =
      await createSkillsWorkspace("no-skill-file");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await mkdir(join(projectDir, "junk-dir"), { recursive: true });
    await writeFile(
      join(projectDir, "junk-dir", "README.md"),
      "not a skill",
      "utf8",
    );
    await writeSkillFile(
      projectDir,
      "real-skill",
      { name: "real-skill", description: "real" },
      "ok",
    );

    const result = await loadSkills(workspaceRoot, {
      globalSkillsDir: null,
      projectSkillsDir: projectDir,
    });
    expect(result.warnings).toEqual([]);
    expect(result.registry.list().map((skill) => skill.name)).toEqual([
      "real-skill",
    ]);
  });
});

describe("buildSkillsPromptHeader", () => {
  it("should return an empty string for an empty registry", () => {
    expect(buildSkillsPromptHeader(createSkillRegistry())).toBe("");
  });

  it("should list every skill name and description", () => {
    const registry = createSkillRegistry();
    registry.register({
      name: "ts-patterns",
      description: "TypeScript rules.",
      content: "",
      sourcePath: "/x",
      origin: "global",
    });
    registry.register({
      name: "react-practices",
      description: "React patterns.",
      content: "",
      sourcePath: "/y",
      origin: "global",
    });
    const header = buildSkillsPromptHeader(registry);
    expect(header).toContain("## Available Skills");
    expect(header).toContain("- react-practices: React patterns.");
    expect(header).toContain("- ts-patterns: TypeScript rules.");
    // react-practices comes before ts-patterns alphabetically
    expect(header.indexOf("react-practices")).toBeLessThan(
      header.indexOf("ts-patterns"),
    );
  });
});
