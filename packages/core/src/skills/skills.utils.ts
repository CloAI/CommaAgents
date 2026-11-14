import { parseDocument } from "yaml";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { SKILL_NAME_PATTERN } from "./skills.constants";
import type { Skill, SkillMetadata, SkillSummary } from "./skills.types";

/** Parse YAML frontmatter and preserve the remaining instruction body.
 * @param {string} rawContent - Complete skill file contents.
 * @returns {{metadata: SkillMetadata, body: string}} Validated identity and Markdown instructions.
 */
export function parseSkillFile(rawContent: string): {
  metadata: SkillMetadata;
  body: string;
} {
  const normalized = rawContent.replace(/^\uFEFF/, "");
  const frontmatter = normalized.match(
    /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/,
  );
  if (!frontmatter) {
    throw new Error(
      "SKILL.md is missing required YAML frontmatter delimited by '---' lines.",
    );
  }
  let fields: unknown;
  try {
    const document = parseDocument(frontmatter[1]!);
    if (document.errors.length) {
      throw new Error("Invalid YAML");
    }
    fields = document.toJS({ maxAliasCount: 100 });
  } catch {
    throw new Error("SKILL.md contains invalid YAML frontmatter.");
  }
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new Error("SKILL.md frontmatter must be a YAML mapping.");
  }
  const name = "name" in fields ? fields.name : undefined;
  const description = "description" in fields ? fields.description : undefined;
  if (typeof name !== "string" || !name.trim()) {
    throw new Error(
      "SKILL.md frontmatter must define a non-empty `name` field.",
    );
  }
  if (typeof description !== "string" || !description.trim()) {
    throw new Error(
      "SKILL.md frontmatter must define a non-empty `description` field.",
    );
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new Error(
      "SKILL.md frontmatter `name` must be kebab-case (lowercase letters, digits, hyphens; 1–64 chars).",
    );
  }
  return {
    metadata: { name, description: description.trim() },
    body: normalized.slice(frontmatter[0].length).replace(/^\r?\n+/, ""),
  };
}

/** Resolve explicit discovery paths without shell expansion.
 * @param {string} directory - Absolute, home-relative, or workspace-relative directory.
 * @param {string} workspace - Base for relative paths.
 * @returns {string} Absolute directory path.
 */
export function resolveSkillDirectory(
  directory: string,
  workspace: string,
): string {
  return resolve(
    workspace,
    directory === "~"
      ? homedir()
      : directory.startsWith("~/")
        ? resolve(homedir(), directory.slice(2))
        : directory,
  );
}

/** Expose metadata without copying skill instructions into list or search results.
 * @param {Skill} skill - Loaded registry entry.
 * @returns {SkillSummary} Public skill summary.
 */
export function summarizeSkill(skill: Skill): SkillSummary {
  return {
    name: skill.name,
    description: skill.description,
    sourcePath: skill.sourcePath,
    origin: skill.origin,
  };
}
