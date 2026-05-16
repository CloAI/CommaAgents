import { homedir, platform } from "node:os";
import { join } from "node:path";

import {
  GLOBAL_SKILLS_SUBDIR,
  PROJECT_SKILLS_SUBDIR,
  SKILL_NAME_PATTERN,
} from "./skills.constants";
import type { SkillMetadata } from "./skills.types";

/**
 * Resolve the platform-appropriate user config root. Mirrors the logic
 * used by the TUI's `resolveConfigRoot` so that skills authored alongside
 * the TUI config are discovered without extra configuration.
 *
 * - macOS: `~/Library/Application Support`
 * - Windows: `%APPDATA%` (falls back to `~/AppData/Roaming`)
 * - Linux/other: `$XDG_CONFIG_HOME` or `~/.config`
 */
export function resolveUserConfigRoot(): string {
  const currentPlatform = platform();
  if (currentPlatform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }
  if (currentPlatform === "win32") {
    return process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  }
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
}

/** Absolute path to the default global skills directory for this user. */
export function resolveDefaultGlobalSkillsDir(): string {
  return join(resolveUserConfigRoot(), GLOBAL_SKILLS_SUBDIR);
}

/** Absolute path to the default project-local skills directory for the given workspace. */
export function resolveDefaultProjectSkillsDir(workspaceRoot: string): string {
  return join(workspaceRoot, PROJECT_SKILLS_SUBDIR);
}

/**
 * Parse the YAML frontmatter of a `SKILL.md` file and return the metadata
 * plus the remaining markdown body. The grammar is intentionally minimal
 * — just enough to recognise:
 *
 * ```
 * ---
 * name: my-skill
 * description: One-line summary.
 * ---
 *
 * # Body
 * ```
 *
 * Unknown frontmatter keys are ignored. Throws `SkillParseError`-style
 * `Error` instances with a descriptive message when required fields are
 * missing or malformed; the caller decides how to surface them.
 */
export function parseSkillFile(rawContent: string): {
  metadata: SkillMetadata;
  body: string;
} {
  const normalised = rawContent.replace(/^\uFEFF/, "");

  // Frontmatter must be the very first thing in the file. We accept the
  // common `---\n...\n---\n` block; anything else is treated as missing
  // frontmatter.
  const frontmatterMatch = normalised.match(
    /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/,
  );
  if (!frontmatterMatch) {
    throw new Error(
      "SKILL.md is missing required YAML frontmatter delimited by '---' lines.",
    );
  }

  const [fullMatch, frontmatterBlock] = frontmatterMatch as unknown as [
    string,
    string,
  ];
  const body = normalised.slice(fullMatch.length).replace(/^\r?\n+/, "");

  const fields = parseSimpleYaml(frontmatterBlock);

  const name = fields.name;
  const description = fields.description;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(
      "SKILL.md frontmatter must define a non-empty `name` field.",
    );
  }
  if (typeof description !== "string" || description.length === 0) {
    throw new Error(
      "SKILL.md frontmatter must define a non-empty `description` field.",
    );
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new Error(
      `SKILL.md frontmatter \`name\` must be kebab-case (lowercase letters, digits, hyphens; 1–64 chars). Got: ${name}`,
    );
  }

  return {
    metadata: { name, description },
    body,
  };
}

/**
 * Minimal YAML subset parser sufficient for `SKILL.md` frontmatter.
 *
 * Supports `key: value` lines where `value` is either a bare scalar or a
 * quoted string (single or double). Multi-line values must use a
 * surrounding pair of quotes on a single line. Comments (`# …`) and
 * blank lines are ignored. Lists and nested mappings are rejected so
 * that authors get a clear error instead of silently-dropped data.
 */
function parseSimpleYaml(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = source.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    if (line.startsWith("- ")) {
      throw new Error(
        "SKILL.md frontmatter does not support YAML lists; use a single string value.",
      );
    }
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Malformed SKILL.md frontmatter line: ${rawLine}`);
    }
    const key = line.slice(0, colonIndex).trim();
    const rawValue = line.slice(colonIndex + 1).trim();
    if (rawValue.length === 0) {
      throw new Error(
        `SKILL.md frontmatter key \`${key}\` is missing a value.`,
      );
    }
    result[key] = unquoteYamlScalar(rawValue);
  }
  return result;
}

/** Strip surrounding quotes from a YAML scalar and decode `\"` / `\\` escapes. */
function unquoteYamlScalar(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      const inner = value.slice(1, -1);
      return first === '"'
        ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        : inner;
    }
  }
  return value;
}
