import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Create a unique temp workspace for skill loader tests. */
export async function createSkillsWorkspace(label: string): Promise<{
  workspaceRoot: string;
  globalDir: string;
  projectDir: string;
}> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceRoot = join(tmpdir(), `comma-skills-${label}-${uniqueSuffix}`);
  const globalDir = join(workspaceRoot, "_global");
  const projectDir = join(workspaceRoot, ".comma", "skills");
  await mkdir(globalDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });
  return { workspaceRoot, globalDir, projectDir };
}

/** Write a `SKILL.md` for the named skill under `parentDir`. */
export async function writeSkillFile(
  parentDir: string,
  skillName: string,
  frontmatter: { name?: string; description?: string },
  body: string,
): Promise<string> {
  const skillDir = join(parentDir, skillName);
  await mkdir(skillDir, { recursive: true });
  const lines: string[] = ["---"];
  if (frontmatter.name !== undefined) lines.push(`name: ${frontmatter.name}`);
  if (frontmatter.description !== undefined)
    lines.push(`description: ${frontmatter.description}`);
  lines.push("---", "", body);
  const filePath = join(skillDir, "SKILL.md");
  await writeFile(filePath, lines.join("\n"), "utf8");
  return filePath;
}
