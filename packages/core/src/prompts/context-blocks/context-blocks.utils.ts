import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { GitSummary } from "./context-blocks.types";

/**
 * Walk up from `cwd` to the nearest directory containing `.git`; `cwd` itself when none is found.
 * @param {string} cwd - Directory to start from.
 * @returns {string} Absolute repository root.
 */
export function findRepositoryRoot(cwd: string): string {
  let directory = resolve(cwd);
  while (true) {
    if (existsSync(join(directory, ".git"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return resolve(cwd);
    directory = parent;
  }
}

/**
 * Directories from `root` down to `cwd`, inclusive, outermost first.
 * @param {string} root - Repository root.
 * @param {string} cwd - Working directory inside the root.
 * @returns {string[]} Absolute directory paths.
 */
export function directoriesBetween(root: string, cwd: string): string[] {
  const segments = relative(root, resolve(cwd))
    .split(/[\\/]/)
    .filter((segment) => segment.length > 0 && segment !== "..");
  return segments.reduce<string[]>(
    (directories, segment) => [
      ...directories,
      join(directories.at(-1)!, segment),
    ],
    [root],
  );
}

/**
 * Parse `git status --porcelain=v1 --branch` output into a branch name and change counts.
 * @param {string} output - Command output.
 * @returns {GitSummary} Branch and counts.
 */
export function parseGitStatus(output: string): GitSummary {
  const [header = "", ...entries] = output
    .split("\n")
    .filter((line) => line.length > 0);
  const branchMatch = /^## (?:No commits yet on )?(.+?)(?:\.\.\.|\s|$)/.exec(
    header,
  );
  const branch =
    header.startsWith("## HEAD (no branch)") || !branchMatch
      ? "detached"
      : branchMatch[1]!;
  const untracked = entries.filter((line) => line.startsWith("??")).length;
  return { branch, changed: entries.length - untracked, untracked };
}

/**
 * Local calendar date as `YYYY-MM-DD`.
 * @param {Date} date - Date to format.
 * @returns {string} The formatted date.
 */
export function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
