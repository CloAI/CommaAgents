import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { SKILL_FILENAME, SKILL_MAX_BYTES } from "./skills.constants";
import { createSkillRegistry } from "./skills.registry";
import type { LoadSkillsOptions, Skill, SkillRegistry } from "./skills.types";
import {
  parseSkillFile,
  resolveDefaultGlobalSkillsDir,
  resolveDefaultProjectSkillsDir,
} from "./skills.utils";

/**
 * A non-fatal warning produced while scanning a skills directory. Surfaced
 * so callers can log malformed or oversized skills without aborting the
 * whole scan.
 */
export interface SkillLoadWarning {
  readonly sourcePath: string;
  readonly message: string;
}

/** Result returned by {@link loadSkills}. */
export interface SkillLoadResult {
  readonly registry: SkillRegistry;
  readonly warnings: readonly SkillLoadWarning[];
}

/**
 * Scan the global and project skill directories and return a populated
 * registry. Missing directories are silently ignored (not an error —
 * users may have neither). Project skills override global skills with
 * the same `name`.
 *
 * Each direct subdirectory containing a `SKILL.md` becomes a skill;
 * deeper nesting is ignored to keep discovery predictable. Files larger
 * than {@link SKILL_MAX_BYTES} or with malformed frontmatter are
 * skipped and reported as `warnings`.
 *
 * @param workspaceRoot - Used to resolve the default project skills directory.
 * @param options       - Override or disable either discovery root.
 */
export async function loadSkills(
  workspaceRoot: string,
  options: LoadSkillsOptions = {},
): Promise<SkillLoadResult> {
  const globalSkillsDir =
    options.globalSkillsDir === null
      ? null
      : (options.globalSkillsDir ?? resolveDefaultGlobalSkillsDir());
  const projectSkillsDir =
    options.projectSkillsDir === null
      ? null
      : (options.projectSkillsDir ??
        resolveDefaultProjectSkillsDir(workspaceRoot));

  const registry = createSkillRegistry();
  const warnings: SkillLoadWarning[] = [];

  // Order matters: register project skills last so that any global skill
  // sharing a name is overridden. The registry also enforces this defensively.
  if (globalSkillsDir !== null) {
    await scanDirectoryInto(globalSkillsDir, "global", registry, warnings);
  }
  if (projectSkillsDir !== null) {
    await scanDirectoryInto(projectSkillsDir, "project", registry, warnings);
  }

  return { registry, warnings };
}

/**
 * Scan a single skills directory and register every well-formed skill.
 * Silently ignores missing directories so an unconfigured global/project
 * root is not an error.
 */
async function scanDirectoryInto(
  skillsDirectory: string,
  origin: Skill["origin"],
  registry: SkillRegistry,
  warnings: SkillLoadWarning[],
): Promise<void> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(skillsDirectory, { withFileTypes: true });
  } catch (readError) {
    const code = (readError as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return;
    throw readError;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(skillsDirectory, entry.name);
    const skillFile = join(skillDir, SKILL_FILENAME);

    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(skillFile);
    } catch (statError) {
      const code = (statError as NodeJS.ErrnoException).code;
      // Subdirectory without a SKILL.md — silently skip.
      if (code === "ENOENT" || code === "ENOTDIR") continue;
      throw statError;
    }
    if (!fileStat.isFile()) continue;
    if (fileStat.size > SKILL_MAX_BYTES) {
      warnings.push({
        sourcePath: skillFile,
        message: `SKILL.md exceeds ${SKILL_MAX_BYTES} bytes (${fileStat.size}). Skipped.`,
      });
      continue;
    }

    let rawContent: string;
    try {
      rawContent = await Bun.file(skillFile).text();
    } catch (readError) {
      warnings.push({
        sourcePath: skillFile,
        message: `Failed to read SKILL.md: ${(readError as Error).message}`,
      });
      continue;
    }

    let parsed: ReturnType<typeof parseSkillFile>;
    try {
      parsed = parseSkillFile(rawContent);
    } catch (parseError) {
      warnings.push({
        sourcePath: skillFile,
        message: (parseError as Error).message,
      });
      continue;
    }

    registry.register({
      name: parsed.metadata.name,
      description: parsed.metadata.description,
      content: parsed.body,
      sourcePath: skillFile,
      origin,
    });
  }
}

/**
 * Build the system-prompt header block advertising available skills.
 * Returns an empty string when the registry is empty so callers can
 * concatenate unconditionally.
 *
 * The block format is deliberately compact — `name: description` per
 * line — so that even dozens of skills cost little context:
 *
 * ```
 * ## Available Skills
 * Call the `load_skill` tool with one of these names to load its full instructions:
 * - ts-patterns: TypeScript conventions for new modules.
 * - react-practices: React component and hook patterns.
 * ```
 */
export function buildSkillsPromptHeader(registry: SkillRegistry): string {
  if (registry.isEmpty()) return "";
  const lines = registry
    .list()
    .map((skill) => `- ${skill.name}: ${skill.description}`)
    .join("\n");
  return [
    "## Available Skills",
    "Call the `load_skill` tool with one of these names to load its full instructions before doing related work:",
    lines,
  ].join("\n");
}
