import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  findCommaProjectRoot,
  getGlobalSkillsDirectory,
  getProjectSkillsDirectory,
} from "../defaults/defaults";
import {
  SKILL_FILENAMES,
  SKILL_MAX_BYTES,
  RECOMMENDED_GLOBAL_SKILL_DIRECTORIES,
} from "./skills.constants";
import { createSkillRegistry } from "./skills.registry";
import type {
  LoadSkillsOptions,
  Skill,
  SkillLoadResult,
  SkillLoadWarning,
  SkillRegistry,
} from "./skills.types";
import { parseSkillFile, resolveSkillDirectory } from "./skills.utils";

export type { SkillLoadResult, SkillLoadWarning } from "./skills.types";

/** Discover one immutable-in-use snapshot. All sources merge; precedence resolves duplicate names.
 * @param {string} workspaceRoot - Workspace used for project discovery and relative explicit roots.
 * @param {LoadSkillsOptions} options - Existing overrides and additional discovery roots.
 * @returns {Promise<SkillLoadResult>} Loaded registry, recoverable diagnostics, and optional Comma project root.
 */
export async function loadSkills(
  workspaceRoot: string,
  options: LoadSkillsOptions = {},
): Promise<SkillLoadResult> {
  const workspace = resolve(workspaceRoot);
  const projectRoot = findCommaProjectRoot(workspace);
  const sources: { directory: string; origin: Skill["origin"] }[] = [];
  if (options.globalSkillsDir !== null) {
    const directories =
      options.globalSkillsDir === undefined
        ? [
            ...RECOMMENDED_GLOBAL_SKILL_DIRECTORIES.slice(0, -1).map(
              (directory) => join(homedir(), directory),
            ),
            getGlobalSkillsDirectory(),
          ]
        : [options.globalSkillsDir];
    sources.push(
      ...directories.map((directory) => ({
        directory,
        origin: "global" as const,
      })),
    );
  }
  sources.push(
    ...(options.additionalDirectories ?? []).map((directory) => ({
      directory,
      origin: "global" as const,
    })),
  );
  if (options.projectSkillsDir !== null) {
    const directory =
      options.projectSkillsDir ??
      (projectRoot ? getProjectSkillsDirectory(projectRoot) : undefined);
    if (directory) {
      sources.push({ directory, origin: "project" });
    }
  }
  const registry = createSkillRegistry();
  const warnings: SkillLoadWarning[] = [];
  // Traverse high priority first so a symlink alias cannot downgrade the same physical source.
  const seen = new Set<string>();
  for (const source of sources.reverse()) {
    const directory = resolveSkillDirectory(source.directory, workspace);
    let identity: string;
    try {
      identity = await realpath(directory);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "ENOENT" || error.code === "ENOTDIR")
      ) {
        try {
          if ((await lstat(directory)).isSymbolicLink()) {
            warnings.push({
              code: "BROKEN_SYMLINK",
              sourcePath: directory,
              message: "Unable to resolve the linked skill source.",
            });
          }
        } catch {
          /* Missing optional roots do not produce diagnostics. */
        }
        continue;
      }
      warnings.push({
        code: "SOURCE_UNREADABLE",
        sourcePath: directory,
        message: "Unable to access skill directory.",
      });
      continue;
    }
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    await scanDirectoryInto(directory, source.origin, registry, warnings);
  }
  return { registry, warnings, ...(projectRoot ? { projectRoot } : {}) };
}

/** Read direct skill directories, following symlinks without recursive traversal.
 * @param {string} directory - Skill source root.
 * @param {Skill["origin"]} origin - Global or project scope.
 * @param {SkillRegistry} registry - Merged result, already containing higher-priority definitions.
 * @param {SkillLoadWarning[]} warnings - Recoverable diagnostics.
 * @returns {Promise<void>} Completion after all direct entries are considered.
 */
async function scanDirectoryInto(
  directory: string,
  origin: Skill["origin"],
  registry: SkillRegistry,
  warnings: SkillLoadWarning[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    warnings.push({
      code: "SOURCE_UNREADABLE",
      sourcePath: directory,
      message: "Unable to read skill directory.",
    });
    return;
  }
  entries.sort((first, second) => first.name.localeCompare(second.name));
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }
    const skillDirectory = join(directory, entry.name);
    let filenames: string[];
    try {
      if (!(await stat(skillDirectory)).isDirectory()) {
        continue;
      }
      filenames = await readdir(skillDirectory);
    } catch {
      warnings.push({
        code: entry.isSymbolicLink() ? "BROKEN_SYMLINK" : "SKILL_UNREADABLE",
        sourcePath: skillDirectory,
        message: "Unable to read skill directory or symlink target.",
      });
      continue;
    }
    const candidates = SKILL_FILENAMES.filter((filename) =>
      filenames.includes(filename),
    );
    if (!candidates.length) {
      continue;
    }
    const sourcePath = join(skillDirectory, candidates[0]!);
    if (candidates.length > 1) {
      warnings.push({
        code: "DUPLICATE_FILENAME",
        sourcePath,
        message: "Both SKILL.md and SKILL.MD exist; SKILL.md takes precedence.",
      });
    }
    let content: string;
    try {
      const file = await open(
        sourcePath,
        constants.O_RDONLY | constants.O_NONBLOCK,
      );
      try {
        if (!(await file.stat()).isFile()) {
          continue;
        }
        const buffer = Buffer.alloc(SKILL_MAX_BYTES + 1);
        let bytesRead = 0;
        while (bytesRead < buffer.length) {
          const chunk = await file.read(
            buffer,
            bytesRead,
            buffer.length - bytesRead,
            null,
          );
          if (!chunk.bytesRead) {
            break;
          }
          bytesRead += chunk.bytesRead;
        }
        if (bytesRead > SKILL_MAX_BYTES) {
          warnings.push({
            code: "SKILL_TOO_LARGE",
            sourcePath,
            message: `SKILL.md exceeds ${SKILL_MAX_BYTES} bytes. Skipped.`,
          });
          continue;
        }
        content = buffer.subarray(0, bytesRead).toString("utf8");
      } finally {
        await file.close();
      }
    } catch {
      warnings.push({
        code: "SKILL_UNREADABLE",
        sourcePath,
        message: "Unable to read skill instructions.",
      });
      continue;
    }
    try {
      const parsed = parseSkillFile(content);
      const existing = registry.get(parsed.metadata.name);
      if (existing) {
        warnings.push({
          code: "SKILL_SHADOWED",
          sourcePath,
          message: `Skill "${parsed.metadata.name}" is shadowed by ${existing.sourcePath}.`,
        });
        continue;
      }
      registry.register({
        ...parsed.metadata,
        content: parsed.body,
        sourcePath,
        origin,
      });
    } catch (error) {
      warnings.push({
        code: "INVALID_SKILL",
        sourcePath,
        message: error instanceof Error ? error.message : "Invalid skill file.",
      });
    }
  }
}

/** Build the complete metadata index for consumers explicitly requesting that representation.
 * @param {SkillRegistry} registry - Registry to describe.
 * @returns {string} Complete skill metadata header, or an empty string.
 */
export function buildSkillsPromptHeader(registry: SkillRegistry): string {
  if (registry.isEmpty()) {
    return "";
  }
  return [
    "## Available Skills",
    "Call the `load_skill` tool with one of these names to load its full instructions before doing related work:",
    registry
      .list()
      .map((skill) => `- ${skill.name}: ${skill.description}`)
      .join("\n"),
  ].join("\n");
}
