import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { SandboxViolationError } from "../errors/index";
import type { SandboxTrashMetadata } from "../tools/io/trash";
import type {
  AccessRequest,
  AuthorizationContext,
  Guard,
  GuardCallbacks,
  GuardPolicySnapshot,
  Policy,
  PolicyDecision,
} from "./guard.types";

// ── Path resolution + jail ────────────────────────────────────────────────

function resolveSymlinks(absolutePath: string): string {
  let current = absolutePath;
  const suffix: string[] = [];

  while (current !== resolve(current, "..") || suffix.length === 0) {
    try {
      const real = realpathSync(current);
      return suffix.length > 0 ? resolve(real, ...suffix.reverse()) : real;
    } catch {
      const parent = resolve(current, "..");
      if (parent === current) break;
      suffix.push(current.slice(parent.length + 1));
      current = parent;
    }
  }
  return absolutePath;
}

function resolvePath(
  cwd: string,
  inputPath: string,
  allowAbsolutePaths: boolean,
  jail: boolean,
): string {
  if (!allowAbsolutePaths && isAbsolute(inputPath)) {
    throw new SandboxViolationError(
      inputPath,
      "absolute-path",
      `Absolute paths are not allowed; use a path relative to "${cwd}".`,
    );
  }

  const resolved = resolve(cwd, inputPath);

  if (!jail) return resolved;

  const realResolved = resolveSymlinks(resolved);
  const realCwd = resolveSymlinks(cwd);
  const sep = "/";
  const jailRoot = realCwd.endsWith(sep) ? realCwd : `${realCwd}${sep}`;

  if (realResolved !== realCwd && !realResolved.startsWith(jailRoot)) {
    throw new SandboxViolationError(
      resolve(cwd, inputPath),
      "jail",
      `Path escapes sandbox jail (cwd: ${cwd})`,
    );
  }

  return realResolved;
}

// ── Guard factory ──────────────────────────────────────────────────────────

/**
 * Create a per-tool Guard instance.
 *
 * The guard resolves paths, enforces the jail boundary, evaluates the
 * policy chain, dispatches "ask" via the callbacks, and self-updates
 * session memory when the user grants/denies access.
 *
 * @param toolName - The tool this guard enforces.
 * @param cwd - Workspace root for path resolution.
 * @param allowAbsolutePaths - Whether absolute input paths are allowed.
 * @param jail - Whether to enforce the cwd boundary.
 * @param policies - Initial policy chain.
 * @param callbacks - onAsk / onPolicyChange handlers (shared across guards).
 */
export function createGuard(
  toolName: string,
  cwd: string,
  allowAbsolutePaths: boolean,
  jail: boolean,
  policies: readonly Policy[],
  callbacks?: GuardCallbacks,
  trashMetadata?: SandboxTrashMetadata,
): Guard {
  const policyChain = [...policies];
  const changeListeners = new Set<(snapshot: GuardPolicySnapshot) => void>();

  // ── policy chain mutation ───────────────────────────────────────────

  function notifyChange(): void {
    const snapshot = getPolicies();
    callbacks?.onPolicyChange?.(snapshot);
    for (const listener of changeListeners) {
      listener(snapshot);
    }
  }

  function addPolicy(policy: Policy, before?: string): void {
    // Deduplicate by name: remove existing policy with same name first
    const existingIdx = policyChain.findIndex((p) => p.name === policy.name);
    if (existingIdx >= 0) {
      policyChain.splice(existingIdx, 1);
    }

    if (before) {
      const idx = policyChain.findIndex((p) => p.name === before);
      if (idx >= 0) {
        policyChain.splice(idx, 0, policy);
      } else {
        policyChain.push(policy);
      }
    } else {
      policyChain.push(policy);
    }
    notifyChange();
  }

  function removePolicy(name: string): boolean {
    const idx = policyChain.findIndex((p) => p.name === name);
    if (idx < 0) return false;
    policyChain.splice(idx, 1);
    notifyChange();
    return true;
  }

  function getPolicies(): GuardPolicySnapshot {
    return {
      toolName,
      policies: policyChain.map((p) => ({ name: p.name })),
    };
  }

  function onPolicyChange(
    listener: (snapshot: GuardPolicySnapshot) => void,
  ): () => void {
    changeListeners.add(listener);
    return () => {
      changeListeners.delete(listener);
    };
  }

  // ── authorization ───────────────────────────────────────────────────

  function buildPermissionRequest(
    request: AccessRequest,
    ctx: AuthorizationContext,
    resolvedPath: string,
  ) {
    return {
      agentName: ctx.agentName,
      toolName: ctx.toolName,
      operation: request.type,
      resource: resolvedPath,
      reason: "policy-ask" as const,
      signal: ctx.signal,
    };
  }

  async function handleAsk(
    request: AccessRequest,
    ctx: AuthorizationContext,
    resolvedPath: string,
  ): Promise<PolicyDecision> {
    if (!callbacks?.onAsk) {
      throw new SandboxViolationError(
        resolvedPath,
        "ask-no-handler",
        `Policy requires interactive approval for "${resolvedPath}" but no onAsk handler is configured.`,
      );
    }

    let decision: PolicyDecision;
    try {
      decision = (await callbacks.onAsk(
        buildPermissionRequest(request, ctx, resolvedPath),
      )) as PolicyDecision;
    } catch {
      throw new SandboxViolationError(
        resolvedPath,
        "ask-aborted",
        `Permission request for "${resolvedPath}" was aborted or threw.`,
      );
    }

    // Apply session memory for all positive/negative decisions.
    if (
      decision === "allow" ||
      decision === "allow-session" ||
      decision === "deny-session"
    ) {
      const mode = request.type === "fs.write" ? "write" : "read";
      const relative = resolvedPath.startsWith(`${cwd}/`)
        ? resolvedPath.slice(cwd.length + 1)
        : resolvedPath;

      if (decision === "allow" || decision === "allow-session") {
        addPolicy(pathSessionPolicy(mode, "allow", relative));
      } else {
        addPolicy(pathSessionPolicy(mode, "deny", relative));
      }
    }

    return decision;
  }

  async function authorize(
    request: AccessRequest,
    ctx: AuthorizationContext,
  ): Promise<string> {
    // For file-system access, resolve the path and enforce jail.
    const resolvedPath =
      request.type === "fs.read" || request.type === "fs.write"
        ? resolvePath(cwd, request.resource, allowAbsolutePaths, jail)
        : request.resource;

    const resolvedRequest: AccessRequest = {
      ...request,
      resource: request.type.startsWith("fs.")
        ? resolvedPath
        : request.resource,
    };

    // Evaluate policy chain — first non-"pass" wins.
    for (const policy of policyChain) {
      const decision = await policy.evaluate(resolvedRequest);
      if (decision === "pass") continue;

      if (decision === "allow") return resolvedPath;

      if (decision === "deny") {
        const reason =
          request.type === "fs.write"
            ? "write-denied"
            : request.type === "fs.read"
              ? "read-denied"
              : "write-denied";
        throw new SandboxViolationError(
          resolvedPath,
          reason,
          `${request.type} access denied for "${resolvedPath}".`,
        );
      }

      if (decision === "ask") {
        const prompted = await handleAsk(request, ctx, resolvedPath);
        if (prompted === "deny" || prompted === "deny-session") {
          const reason =
            request.type === "fs.write"
              ? "write-denied"
              : request.type === "fs.read"
                ? "read-denied"
                : "write-denied";
          throw new SandboxViolationError(
            resolvedPath,
            reason,
            `${request.type} access denied by user for "${resolvedPath}".`,
          );
        }
        return resolvedPath;
      }
    }

    // No policy handled this request — implicit allow.
    return resolvedPath;
  }

  function canAccess(request: AccessRequest): boolean {
    try {
      const resolvedPath =
        request.type === "fs.read" || request.type === "fs.write"
          ? resolvePath(cwd, request.resource, allowAbsolutePaths, jail)
          : request.resource;

      const resolvedRequest: AccessRequest = {
        ...request,
        resource: request.type.startsWith("fs.")
          ? resolvedPath
          : request.resource,
      };

      for (const policy of policyChain) {
        const decision = policy.evaluate(resolvedRequest);
        // canAccess is sync — if a policy promises "ask", treat as deny.
        if (decision instanceof Promise) continue;
        if (decision === "pass") continue;
        return decision === "allow";
      }
      // No policy handled = implicit allow.
      return true;
    } catch {
      return false;
    }
  }

  async function askQuestion(
    question: string,
    ctx: AuthorizationContext,
  ): Promise<string> {
    if (!callbacks?.onQuestion) {
      throw new Error(
        "No onQuestion handler is configured.",
      );
    }
    return callbacks.onQuestion({
      agentName: ctx.agentName,
      toolName: ctx.toolName,
      question,
    });
  }

  return {
    toolName,
    cwd,
    trashMetadata,
    authorize,
    canAccess,
    addPolicy,
    removePolicy,
    getPolicies,
    onPolicyChange,
    askQuestion,
  };
}

// ── Session memory helper ──────────────────────────────────────────────────

function pathSessionPolicy(
  mode: "read" | "write",
  decision: "allow" | "deny",
  relative: string,
): Policy {
  const fsType = mode === "write" ? "fs.write" : "fs.read";
  const decisionName = decision === "allow" ? "allow" : "deny";

  return {
    name: `session-${decisionName}-${mode}-${relative.replace(/[^a-zA-Z0-9]/g, "-")}`,
    evaluate: (req: AccessRequest): PolicyDecision => {
      if (req.type !== fsType) return "pass";
      if (
        req.resource.endsWith(`/${relative}`) ||
        req.resource === `${cwd}/${relative}` ||
        req.resource === `${cwd}/${relative}`
      ) {
        return decision;
      }
      // Match the pattern as a suffix to handle the resolved absolute path
      const cwdSep = cwd.endsWith("/") ? cwd : `${cwd}/`;
      const pattern = `${cwdSep}${relative}`;
      if (req.resource === pattern || req.resource.startsWith(`${pattern}/`)) {
        return decision;
      }
      // Also try Bun.Glob-style matching
      if (req.resource.startsWith(cwdSep)) {
        const rel = req.resource.slice(cwdSep.length);
        if (new Bun.Glob(relative).match(rel)) {
          return decision;
        }
      }
      return "pass";
    },
  };
}
