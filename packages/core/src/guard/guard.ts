import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { SandboxViolationError } from "../errors/index";
import type { AccessMode, PermissionDecision } from "../sandbox/sandbox.types";
import type { SandboxTrashMetadata } from "../tools/io/trash";
import type {
  AccessRequest,
  AuthorizationContext,
  Guard,
  GuardCallbacks,
  GuardPolicySnapshot,
  Policy,
  PolicyDecision,
  PolicyPriority,
} from "./guard.types";

function resolveSymlinks(absolutePath: string): string {
  let current = absolutePath;
  const suffix: string[] = [];

  while (current !== resolve(current, "..") || suffix.length === 0) {
    try {
      const real = realpathSync(current);
      return suffix.length > 0 ? resolve(real, ...suffix.reverse()) : real;
    } catch {
      const parent = resolve(current, "..");
      if (parent === current) {
        break;
      }
      suffix.push(current.slice(parent.length + 1));
      current = parent;
    }
  }
  return absolutePath;
}

function resolvePath(
  cwd: string,
  inputPath: string,
  absolutePaths: "allow" | "deny",
): { readonly path: string; readonly outsideWorkspace: boolean } {
  if (absolutePaths === "deny" && isAbsolute(inputPath)) {
    throw new SandboxViolationError(
      inputPath,
      "absolute-path",
      `Absolute paths are not allowed; use a path relative to "${cwd}".`,
    );
  }

  const resolved = resolve(cwd, inputPath);
  const realResolved = resolveSymlinks(resolved);
  const realCwd = resolveSymlinks(cwd);
  const sep = "/";
  const jailRoot = realCwd.endsWith(sep) ? realCwd : `${realCwd}${sep}`;

  return {
    path: realResolved,
    outsideWorkspace:
      realResolved !== realCwd && !realResolved.startsWith(jailRoot),
  };
}

const POLICY_PRIORITY: Readonly<Record<PolicyPriority, number>> = {
  mandatory: 0,
  session: 1,
  tool: 2,
  default: 3,
};

function sortPolicies(policies: Policy[]): void {
  policies.sort(
    (left, right) =>
      POLICY_PRIORITY[left.priority ?? "tool"] -
      POLICY_PRIORITY[right.priority ?? "tool"],
  );
}

/**
 * Create a per-tool Guard instance.
 *
 * The guard resolves paths, enforces the workspace boundary, evaluates the
 * policy chain, dispatches "ask" via the callbacks, and self-updates
 * session memory when the user grants/denies access.
 *
 * @param toolName - The tool this guard enforces.
 * @param cwd - Workspace root for path resolution.
 * @param absolutePaths - Whether absolute input paths are accepted.
 * @param outsideWorkspace - Decision for paths outside the workspace.
 * @param policies - Initial policy chain.
 * @param callbacks - onAsk / onPolicyChange handlers (shared across guards).
 */
export function createGuard(
  toolName: string,
  cwd: string,
  absolutePaths: "allow" | "deny",
  outsideWorkspace: AccessMode,
  policies: readonly Policy[],
  callbacks?: GuardCallbacks,
  trashMetadata?: SandboxTrashMetadata,
): Guard {
  const policyChain = [
    ...new Map(policies.map((policy) => [policy.name, policy])).values(),
  ];
  sortPolicies(policyChain);
  const changeListeners = new Set<(snapshot: GuardPolicySnapshot) => void>();

  function notifyChange(): void {
    const snapshot = getPolicies();
    callbacks?.onPolicyChange?.(snapshot);
    for (const listener of changeListeners) {
      listener(snapshot);
    }
  }

  function addPolicy(policy: Policy): void {
    // Deduplicate by name: remove existing policy with same name first
    const existingIdx = policyChain.findIndex((p) => p.name === policy.name);
    if (existingIdx >= 0) {
      policyChain.splice(existingIdx, 1);
    }

    policyChain.push(policy);
    sortPolicies(policyChain);
    notifyChange();
  }

  function removePolicy(name: string): boolean {
    const idx = policyChain.findIndex((p) => p.name === name);
    if (idx < 0) {
      return false;
    }
    policyChain.splice(idx, 1);
    notifyChange();
    return true;
  }

  function getPolicies(): GuardPolicySnapshot {
    return {
      toolName,
      policies: policyChain.map((policy) => ({
        name: policy.name,
        priority: policy.priority ?? "tool",
      })),
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
  ): Promise<PermissionDecision> {
    if (!callbacks?.onAsk) {
      throw new SandboxViolationError(
        resolvedPath,
        "ask-no-handler",
        `Policy requires interactive approval for "${resolvedPath}" but no onAsk handler is configured.`,
      );
    }

    let decision: PermissionDecision;
    try {
      decision = await callbacks.onAsk(
        buildPermissionRequest(request, ctx, resolvedPath),
      );
    } catch {
      throw new SandboxViolationError(
        resolvedPath,
        "ask-aborted",
        `Permission request for "${resolvedPath}" was aborted or threw.`,
      );
    }

    if (decision === "allow-session" || decision === "deny-session") {
      addPolicy(
        sessionPolicy(
          request,
          decision === "allow-session" ? "allow" : "deny",
          resolvedPath,
        ),
      );
    }

    return decision;
  }

  async function authorize(
    request: AccessRequest,
    ctx: AuthorizationContext,
  ): Promise<string> {
    // Resolve symlinks before applying the workspace boundary.
    const resolved =
      request.type === "fs.read" || request.type === "fs.write"
        ? resolvePath(cwd, request.resource, absolutePaths)
        : { path: request.resource, outsideWorkspace: false };
    const resolvedPath = resolved.path;

    const resolvedRequest: AccessRequest = {
      ...request,
      resource: request.type.startsWith("fs.")
        ? resolvedPath
        : request.resource,
    };

    const mandatoryDecision = await evaluatePolicyPriority(
      policyChain,
      resolvedRequest,
      "mandatory",
    );
    if (mandatoryDecision === "deny") {
      throw new SandboxViolationError(
        resolvedPath,
        request.type === "fs.write"
          ? "write-denied"
          : request.type === "fs.read"
            ? "read-denied"
            : "write-denied",
        `${request.type} access denied for "${resolvedPath}".`,
      );
    }
    if (mandatoryDecision === "ask") {
      const prompted = await handleAsk(request, ctx, resolvedPath);
      if (prompted === "deny" || prompted === "deny-session") {
        throw new SandboxViolationError(
          resolvedPath,
          request.type === "fs.write"
            ? "write-denied"
            : request.type === "fs.read"
              ? "read-denied"
              : "write-denied",
          `${request.type} access denied by user for "${resolvedPath}".`,
        );
      }
    }

    if (resolved.outsideWorkspace) {
      const rememberedDecision = await evaluatePolicyPriority(
        policyChain,
        resolvedRequest,
        "session",
      );
      if (rememberedDecision === "allow") {
        return resolvedPath;
      }
      if (rememberedDecision === "deny") {
        throw new SandboxViolationError(
          resolvedPath,
          request.type === "fs.write" ? "write-denied" : "read-denied",
          `${request.type} access denied for "${resolvedPath}".`,
        );
      }
      if (outsideWorkspace === "deny") {
        throw new SandboxViolationError(
          resolvedPath,
          "jail",
          `Path escapes sandbox workspace (cwd: ${cwd})`,
        );
      }
      if (outsideWorkspace === "ask") {
        const prompted = await handleAsk(request, ctx, resolvedPath);
        if (prompted === "deny" || prompted === "deny-session") {
          throw new SandboxViolationError(
            resolvedPath,
            request.type === "fs.write" ? "write-denied" : "read-denied",
            `${request.type} access denied by user for "${resolvedPath}".`,
          );
        }
        return resolvedPath;
      }
    }

    for (const policy of policyChain) {
      if (policy.priority === "mandatory") {
        continue;
      }
      const decision = await policy.evaluate(resolvedRequest);
      if (decision === "pass") {
        continue;
      }

      if (decision === "allow") {
        return resolvedPath;
      }

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
      const resolved =
        request.type === "fs.read" || request.type === "fs.write"
          ? resolvePath(cwd, request.resource, absolutePaths)
          : { path: request.resource, outsideWorkspace: false };
      const resolvedPath = resolved.path;

      if (resolved.outsideWorkspace && outsideWorkspace !== "allow") {
        return false;
      }

      const resolvedRequest: AccessRequest = {
        ...request,
        resource: request.type.startsWith("fs.")
          ? resolvedPath
          : request.resource,
      };

      for (const policy of policyChain) {
        const decision = policy.evaluate(resolvedRequest);
        if (decision instanceof Promise) {
          return false;
        }
        if (decision === "pass") {
          continue;
        }
        if (policy.priority === "mandatory" && decision === "allow") {
          continue;
        }
        return decision === "allow";
      }
      // No policy handled = implicit allow.
      return true;
    } catch {
      return false;
    }
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
  };
}

function sessionPolicy(
  request: AccessRequest,
  decision: "allow" | "deny",
  resolvedResource: string,
): Policy {
  const decisionName = decision === "allow" ? "allow" : "deny";

  return {
    name: `session-${decisionName}-${request.type}-${resolvedResource.replace(/[^a-zA-Z0-9]/g, "-")}`,
    priority: "session",
    evaluate: (req: AccessRequest): PolicyDecision => {
      return req.type === request.type && req.resource === resolvedResource
        ? decision
        : "pass";
    },
  };
}

async function evaluatePolicyPriority(
  policies: readonly Policy[],
  request: AccessRequest,
  priority: PolicyPriority,
): Promise<PolicyDecision> {
  for (const policy of policies) {
    if ((policy.priority ?? "tool") !== priority) {
      continue;
    }
    const decision = await policy.evaluate(request);
    if (decision !== "pass") {
      return decision;
    }
  }
  return "pass";
}
