import type { AccessRequest, Policy, PolicyDecision } from "./guard.types";
import type { PathPolicy } from "../sandbox/sandbox.types";

// ── Glob matching helpers ────────────────────────────────────────────────

function matchesAny(
  absolutePath: string,
  patterns: readonly string[],
  cwd: string,
): boolean {
  const sep = "/";
  const cwdWithSep = cwd.endsWith(sep) ? cwd : `${cwd}${sep}`;
  if (absolutePath !== cwd && !absolutePath.startsWith(cwdWithSep)) {
    return false;
  }
  const relative = absolutePath === cwd ? "." : absolutePath.slice(cwdWithSep.length);
  for (const pattern of patterns) {
    if (new Bun.Glob(pattern).match(relative)) return true;
  }
  return false;
}

function decide(
  absolutePath: string,
  policy: PathPolicy,
  cwd: string,
): PolicyDecision {
  if (policy.deny && policy.deny.length > 0 && matchesAny(absolutePath, policy.deny, cwd)) {
    return "deny";
  }
  if (policy.allow && policy.allow.length > 0 && matchesAny(absolutePath, policy.allow, cwd)) {
    return "allow";
  }
  if (policy.default === "allow" || policy.default === "deny" || policy.default === "ask") {
    return policy.default;
  }
  return "pass";
}

// ── Domain helpers ────────────────────────────────────────────────────────

function isReadAccess(type: string): boolean {
  return type === "fs.read";
}

function isWriteAccess(type: string): boolean {
  return type === "fs.write";
}

function isCommandAccess(type: string): boolean {
  return type === "command.execute";
}

function isFsAccess(type: string): boolean {
  return isReadAccess(type) || isWriteAccess(type);
}

// ── Built-in policy factories ─────────────────────────────────────────────

/**
 * Unconditionally deny paths matching secret/sensitive glob patterns.
 * Runs before read/write policies; cannot be overridden.
 */
export function forbiddenGlobsPolicy(
  globs: readonly string[],
  cwd: string,
): Policy {
  return {
    name: "forbidden-globs",
    evaluate: (req: AccessRequest): PolicyDecision => {
      if (!isFsAccess(req.type)) return "pass";
      return matchesAny(req.resource, globs, cwd) ? "deny" : "pass";
    },
  };
}

/**
 * deny > allow > default for a class of file-system operations.
 * Respects the evaluation order: deny wins over allow, allow wins over default.
 */
export function pathPolicy(
  mode: "read" | "write",
  config: PathPolicy | undefined,
  cwd: string,
): Policy {
  return {
    name: `${mode}-path-policy`,
    evaluate: (req: AccessRequest): PolicyDecision => {
      if (mode === "read" && !isReadAccess(req.type)) return "pass";
      if (mode === "write" && !isWriteAccess(req.type)) return "pass";
      return decide(req.resource, config ?? { default: "allow" }, cwd);
    },
  };
}

/**
 * Always-deny specific commands (regex patterns).
 * Runs during the guard's policy chain for "command.execute" requests.
 */
export function denyCommandsPolicy(patterns: readonly string[]): Policy {
  return {
    name: "deny-commands",
    evaluate: (req: AccessRequest): PolicyDecision => {
      if (!isCommandAccess(req.type)) return "pass";
      for (const pattern of patterns) {
        try {
          if (new RegExp(pattern).test(req.resource)) return "deny";
        } catch {
          // invalid regex → skip
        }
      }
      return "pass";
    },
  };
}

/**
 * Ask (prompt the user) for commands matching approval patterns.
 * Returns "ask" when a command matches; the guard's onAsk callback handles the prompt.
 */
export function approveCommandsPolicy(patterns: readonly string[]): Policy {
  return {
    name: "approve-commands",
    evaluate: (req: AccessRequest): PolicyDecision => {
      if (!isCommandAccess(req.type)) return "pass";
      for (const pattern of patterns) {
        try {
          if (new RegExp(pattern).test(req.resource)) return "ask";
        } catch {
          // invalid regex → skip
        }
      }
      return "pass";
    },
  };
}

/**
 * Build the default policy chain for a new guard.
 * Order: forbiddenGlobs → readPath → writePath.
 * Tool-specific policies should be added after these.
 */
export function buildDefaultPolicies(
  forbiddenGlobs: readonly string[],
  read: PathPolicy | undefined,
  write: PathPolicy | undefined,
  cwd: string,
): Policy[] {
  const policies: Policy[] = [];

  if (forbiddenGlobs.length > 0) {
    policies.push(forbiddenGlobsPolicy(forbiddenGlobs, cwd));
  }

  policies.push(pathPolicy("read", read, cwd));
  policies.push(pathPolicy("write", write, cwd));

  return policies;
}
