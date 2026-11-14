import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSkills } from "./skills.loader";
import {
  resetCoreLocationOverrides,
  setApplicationDataDirectory,
} from "../defaults/defaults";

const environment = vi.hoisted(() => ({ home: "" }));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => environment.home,
}));
let workspace: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "comma-sources-"));
  environment.home = join(workspace, "home");
  await mkdir(environment.home);
  setApplicationDataDirectory(join(environment.home, ".comma"));
});
afterEach(async () => {
  resetCoreLocationOverrides();
  await rm(workspace, { recursive: true, force: true });
});
async function write(root: string, folder: string, name = folder) {
  const directory = join(environment.home, root, "skills", folder);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${root}\n---\n${root}`,
  );
}

describe("conventional skill sources", () => {
  it("should merge shared and legacy roots while preferring canonical conflicts", async () => {
    for (const source of [".agents", ".comma", ".config/comma"]) {
      await write(source, "shared");
    }
    await write(".agents", "shared-only");
    await write(".comma", "legacy-only");
    await write(".config/comma", "canonical-only");
    for (const excluded of [".claude", ".codex", ".config/opencode"]) {
      await write(excluded, "excluded");
    }
    const cwd = join(environment.home, "workspace", "nested");
    await mkdir(cwd, { recursive: true });
    const result = await loadSkills(cwd);
    expect(result.projectRoot).toBeUndefined();
    expect(result.registry.list().map((entry) => entry.name)).toEqual([
      "canonical-only",
      "legacy-only",
      "shared",
      "shared-only",
    ]);
    expect(result.registry.get("shared")?.content).toBe(".config/comma");
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "SKILL_SHADOWED",
      "SKILL_SHADOWED",
    ]);
  });
  it("should honor explicit global overrides and disabled discovery", async () => {
    await write(".agents", "ambient");
    await write("override", "explicit");
    const options = {
      globalSkillsDir: join(environment.home, "override", "skills"),
      projectSkillsDir: null,
    };
    expect(
      (await loadSkills(workspace, options)).registry
        .list()
        .map((entry) => entry.name),
    ).toEqual(["explicit"]);
    expect(
      (
        await loadSkills(workspace, {
          globalSkillsDir: null,
          projectSkillsDir: null,
        })
      ).registry.isEmpty(),
    ).toBe(true);
  });
});
