import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { SandboxViolationError } from "../../errors";
import { compileGlob } from "../../glob/glob";
import { sandboxErrorToToolError } from "../io";
import { toolError } from "../result";
import type {
  FileSearchIssue,
  ToolContext,
  ToolError,
  WalkFileEntry,
  WalkFilesOptions,
} from "../tool.types";

/**
 * Walk authorized entries in deterministic order without following child symlinks.
 * @param {WalkFilesOptions} options - Search root, filters, depth, and tool identity.
 * @param {ToolContext} context - Guard, cancellation, and agent identity.
 * @param {Set<FileSearchIssue>} issues - Reasons traversal is incomplete.
 * @returns {AsyncGenerator<WalkFileEntry>} Authorized entries.
 * @yields {WalkFileEntry} Each entry before its descendants are visited.
 */
export async function* walkFiles(
  { root, excludeGlobs, maxDepth, toolName }: WalkFilesOptions,
  { guard, abort, agentName }: ToolContext,
  issues: Set<FileSearchIssue>,
): AsyncGenerator<WalkFileEntry> {
  abort.throwIfAborted();
  const absoluteRoot = await guard.authorize(
    { type: "fs.read", resource: root },
    { agentName, toolName, signal: abort },
  );
  if (!(await stat(absoluteRoot)).isDirectory()) {
    throw Object.assign(new Error(`Not a directory: ${root}`), {
      code: "ENOTDIR",
    });
  }
  const exclusions = (
    excludeGlobs ?? [
      "**/.git/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
    ]
  ).map(compileGlob);
  const queue = [{ absolutePath: absoluteRoot, depth: 0 }];
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
    abort.throwIfAborted();
    const directory = queue[queueIndex]!;
    let entries;
    try {
      entries = await readdir(directory.absolutePath, { withFileTypes: true });
    } catch (caught) {
      abort.throwIfAborted();
      if (queueIndex === 0) {
        throw caught;
      }
      issues.add("unreadable_path");
      continue;
    }
    entries.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      abort.throwIfAborted();
      if (!entry.isFile() && !entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }
      const absolutePath = join(directory.absolutePath, entry.name);
      const relativePath = relative(absoluteRoot, absolutePath)
        .split(sep)
        .join("/");
      const path = relative(guard.cwd, absolutePath).split(sep).join("/");
      // Checking the directory itself AND its descendants prunes default **/name/** rules.
      if (
        exclusions.some(
          (matches) =>
            matches(relativePath) ||
            (entry.isDirectory() && matches(`${relativePath}/`)),
        ) ||
        !guard.canAccess({ type: "fs.read", resource: path })
      ) {
        continue;
      }
      yield {
        absolutePath,
        path,
        relativePath,
        type: entry.isSymbolicLink()
          ? "symlink"
          : entry.isDirectory()
            ? "directory"
            : "file",
      };
      if (entry.isDirectory()) {
        if (directory.depth + 1 >= maxDepth) {
          issues.add("depth_limit");
        } else {
          queue.push({ absolutePath, depth: directory.depth + 1 });
        }
      }
    }
  }
  abort.throwIfAborted();
}

/**
 * Convert filesystem and guard failures to the existing tool error contract.
 * @param {unknown} caught - Filesystem or authorization error.
 * @param {string} path - Requested search root.
 * @returns {ToolError} A structured tool failure.
 */
export function fileToolError(caught: unknown, path: string): ToolError {
  if (caught instanceof SandboxViolationError) {
    return sandboxErrorToToolError(caught);
  }
  const code = (caught as NodeJS.ErrnoException)?.code;
  const kind =
    code === "ENOENT" || code === "ENOTDIR"
      ? "not_found"
      : code === "EACCES" || code === "EPERM"
        ? "permission_denied"
        : "unknown";
  return toolError(
    kind,
    `Cannot search ${path}: ${caught instanceof Error ? caught.message : String(caught)}`,
    { path, recoverable: false },
  );
}
