import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { AccessMode, PathPolicy } from "./sandbox.types";

/**
 * Resolve `inputPath` against `cwd`. When `jail` is enabled, assert
 * the result stays within `cwd` (after best-effort symlink resolution).
 *
 * For paths that do not exist yet (e.g., new files to be written) we
 * walk up to the nearest existing ancestor before calling `realpathSync`,
 * then re-append the non-existent suffix. This ensures the jail check is
 * not trivially bypassed by pointing to a not-yet-created path.
 *
 * @throws {Error} with message `"jail"` when the resolved path escapes cwd.
 */
export function resolveWithinJail(
  cwd: string,
  inputPath: string,
  options: { jail: boolean },
): string {
  const resolved = resolve(cwd, inputPath);

  if (!options.jail) {
    return resolved;
  }

  // Best-effort realpath: walk up until we find an existing ancestor, resolve
  // symlinks on that portion, then re-join the remainder.
  const realResolved = resolveSymlinks(resolved);
  const realCwd = resolveSymlinks(cwd);

  const jailRoot = realCwd.endsWith(sep) ? realCwd : `${realCwd}${sep}`;

  if (realResolved !== realCwd && !realResolved.startsWith(jailRoot)) {
    throw new Error("jail");
  }

  return realResolved;
}

/**
 * Walk up the path until we hit an existing entry, resolve symlinks on that
 * portion, then re-append the non-existent suffix. Falls back to the input
 * path if nothing on the chain exists.
 */
function resolveSymlinks(absolutePath: string): string {
  let current = absolutePath;
  const suffix: string[] = [];

  // Walk up until we find something that exists
  while (current !== resolve(current, "..") || suffix.length === 0) {
    try {
      const real = realpathSync(current);
      // Re-append any non-existent suffix segments
      return suffix.length > 0 ? resolve(real, ...suffix.reverse()) : real;
    } catch {
      const parent = resolve(current, "..");
      if (parent === current) break; // reached filesystem root, nothing exists
      suffix.push(current.slice(parent.length + 1));
      current = parent;
    }
  }

  return absolutePath;
}

/**
 * Return `true` when any of the glob `patterns` matches the path relative
 * to `cwd`. Patterns are evaluated with Bun.Glob.
 *
 * Absolute paths outside cwd never match pattern-relative globs.
 */
export function matchesAny(absolutePath: string, patterns: readonly string[], cwd: string): boolean {
  const cwdWithSep = cwd.endsWith(sep) ? cwd : `${cwd}${sep}`;

  // Paths outside cwd cannot match cwd-relative patterns
  if (absolutePath !== cwd && !absolutePath.startsWith(cwdWithSep)) {
    return false;
  }

  const relativePath =
    absolutePath === cwd ? "." : absolutePath.slice(cwdWithSep.length);

  for (const pattern of patterns) {
    const glob = new Bun.Glob(pattern);
    if (glob.match(relativePath)) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluate a PathPolicy against an absolute path, returning the effective
 * AccessMode. Deny patterns take precedence over allow patterns; both take
 * precedence over the `default` decision.
 */
export function decide(absolutePath: string, policy: PathPolicy, cwd: string): AccessMode {
  // Deny wins over everything
  if (policy.deny && policy.deny.length > 0 && matchesAny(absolutePath, policy.deny, cwd)) {
    return "deny";
  }

  // Explicit allow overrides default
  if (policy.allow && policy.allow.length > 0 && matchesAny(absolutePath, policy.allow, cwd)) {
    return "allow";
  }

  return policy.default;
}
