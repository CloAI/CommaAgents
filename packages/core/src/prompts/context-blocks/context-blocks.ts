import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  DEFAULT_INSTRUCTION_FILES,
  MAX_INSTRUCTION_CHARACTERS,
} from "./context-blocks.constants";
import type {
  BuildContextBlocksOptions,
  EnvironmentDescription,
  ProjectInstruction,
} from "./context-blocks.types";
import {
  directoriesBetween,
  findRepositoryRoot,
  localDate,
  parseGitStatus,
} from "./context-blocks.utils";

/**
 * Collect AGENTS.md-style instruction files from the repository root down to `cwd`.
 *
 * Each directory contributes at most one file: the first of `instructionFiles` that exists.
 * Results are ordered outermost first, so the file nearest `cwd` comes last and wins conflicts.
 *
 * @param {string} cwd - Working directory of the run.
 * @param {readonly string[]} instructionFiles - File names checked per directory, in priority order.
 * @returns {Promise<ProjectInstruction[]>} Instruction files with repository-relative paths.
 * @example
 * ```ts
 * const instructions = await loadProjectInstructions(process.cwd(), ["AGENTS.md", "CLAUDE.md"]);
 * ```
 */
export async function loadProjectInstructions(
  cwd: string,
  instructionFiles: readonly string[] = DEFAULT_INSTRUCTION_FILES,
): Promise<ProjectInstruction[]> {
  const root = findRepositoryRoot(cwd);
  const instructions: ProjectInstruction[] = [];
  for (const directory of directoriesBetween(root, cwd)) {
    const fileName = instructionFiles.find((candidate) =>
      existsSync(join(directory, candidate)),
    );
    if (fileName === undefined) {
      continue;
    }
    const filePath = join(directory, fileName);
    const content = (await readFile(filePath, "utf-8")).trim();
    if (content.length === 0) {
      continue;
    }
    instructions.push({
      path: relative(root, filePath),
      content:
        content.length > MAX_INSTRUCTION_CHARACTERS
          ? `${content.slice(0, MAX_INSTRUCTION_CHARACTERS)}\n[truncated]`
          : content,
    });
  }
  return instructions;
}

/**
 * Describe the working directory, date, platform, and git state of a run.
 *
 * @param {string} cwd - Working directory of the run.
 * @returns {EnvironmentDescription} Environment facts; `git` is omitted outside a repository.
 * @example
 * ```ts
 * const environment = describeEnvironment(process.cwd());
 * ```
 */
export function describeEnvironment(cwd: string): EnvironmentDescription {
  const absoluteCwd = resolve(cwd);
  const description = {
    cwd: absoluteCwd,
    date: localDate(new Date()),
    platform: process.platform,
  };
  const status = spawnSync("git", ["status", "--porcelain=v1", "--branch"], {
    cwd: absoluteCwd,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (status.status !== 0) {
    return description;
  }
  return { ...description, git: parseGitStatus(status.stdout.toString()) };
}

/**
 * Render instruction and environment blocks as tagged sections for a system prompt.
 *
 * @param {readonly ProjectInstruction[]} instructions - Instruction files, outermost first.
 * @param {EnvironmentDescription} [environment] - Environment facts, when selected.
 * @returns {string} Tagged blocks, or an empty string when nothing is selected.
 * @example
 * ```ts
 * const blocks = renderContextBlocks(await loadProjectInstructions(cwd), describeEnvironment(cwd));
 * ```
 */
export function renderContextBlocks(
  instructions: readonly ProjectInstruction[],
  environment?: EnvironmentDescription,
): string {
  const blocks = instructions.map(
    (instruction) =>
      `<project_instructions path="${instruction.path}">\n${instruction.content}\n</project_instructions>`,
  );
  if (instructions.length > 0) {
    blocks.unshift(
      "Project instructions follow. Deeper files override outer ones; the user's direct requests override both.",
    );
  }
  if (environment) {
    const lines = [
      `cwd: ${environment.cwd}`,
      `date: ${environment.date}`,
      `platform: ${environment.platform}`,
      ...(environment.git
        ? [
            `git: branch ${environment.git.branch}, ${environment.git.changed} changed, ${environment.git.untracked} untracked`,
          ]
        : []),
    ];
    blocks.push(`<environment>\n${lines.join("\n")}\n</environment>`);
  }
  return blocks.join("\n\n");
}

/**
 * Build the selected run-time blocks for one agent.
 *
 * @param {BuildContextBlocksOptions} options - Working directory, selection, and instruction file names.
 * @returns {Promise<string>} Rendered blocks, or an empty string when nothing is selected.
 * @example
 * ```ts
 * const blocks = await buildContextBlocks({ cwd, instructions: true, environment: true });
 * ```
 */
export async function buildContextBlocks({
  cwd,
  instructions,
  environment,
  instructionFiles,
}: BuildContextBlocksOptions): Promise<string> {
  return renderContextBlocks(
    instructions ? await loadProjectInstructions(cwd, instructionFiles) : [],
    environment ? describeEnvironment(cwd) : undefined,
  );
}
