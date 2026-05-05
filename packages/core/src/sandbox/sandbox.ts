import { resolve } from "node:path";
import { SandboxViolationError } from "../errors/index";
import { PERMISSIVE_SANDBOX_CONFIG } from "./sandbox.constants";
import type {
  AuthorizationContext,
  PathPolicy,
  PermissionDecision,
  PermissionOperation,
  PolicyChangeListener,
  PolicyPatch,
  PolicySnapshot,
  Sandbox,
  SandboxConfig,
  SandboxDependencies,
} from "./sandbox.types";
import { decide, resolveWithinJail } from "./sandbox.utils";

/**
 * Create a Sandbox instance from a configuration and optional dependencies.
 *
 * The sandbox is the runtime policy enforcer for a strategy's execution
 * environment. It declares the working directory and read/write policies
 * that all file-system tools must consult before performing I/O.
 *
 * @param config - Static sandbox configuration. Defaults to PERMISSIVE_SANDBOX_CONFIG.
 * @param dependencies - Optional runtime dependencies, notably a PermissionRequester
 *   for interactive policy resolution when a path's policy is `"ask"`.
 *
 * @example
 * ```ts
 * const sandbox = createSandbox({
 *   cwd: "/projects/my-app",
 *   jail: true,
 *   write: { default: "ask" },
 * }, {
 *   requestPermission: async (request) => {
 *     const answer = await prompt(`Allow write to ${request.resource}?`);
 *     return answer ? "allow" : "deny";
 *   },
 * });
 * ```
 */
export function createSandbox(
  config?: SandboxConfig,
  dependencies?: SandboxDependencies,
): Sandbox {
  const resolvedConfig = config ?? PERMISSIVE_SANDBOX_CONFIG;
  const sandboxCwd = resolve(resolvedConfig.cwd ?? process.cwd());
  const jailEnabled = resolvedConfig.jail ?? false;
  const { requestPermission } = dependencies ?? {};

  // Mutable in-memory policy — mutated by updatePolicy() and session decisions
  let readPolicy: PathPolicy = resolvedConfig.read ?? { default: "allow" };
  let writePolicy: PathPolicy = resolvedConfig.write ?? { default: "allow" };

  const policyChangeListeners = new Set<PolicyChangeListener>();

  // Internal helpers

  function resolveJailed(inputPath: string): string {
    try {
      return resolveWithinJail(sandboxCwd, inputPath, { jail: jailEnabled });
    } catch {
      throw new SandboxViolationError(
        resolve(sandboxCwd, inputPath),
        "jail",
        `Path escapes sandbox jail (cwd: ${sandboxCwd})`,
      );
    }
  }

  function notifyPolicyChange(): void {
    const snapshot: PolicySnapshot = { read: readPolicy, write: writePolicy };
    for (const listener of policyChangeListeners) {
      listener(snapshot);
    }
  }

  /**
   * Perform the async "ask" flow: call the requester and apply session-level
   * decisions back to the in-memory policy.
   */
  async function handleAsk(
    absolutePath: string,
    operation: PermissionOperation,
    authorizationContext: AuthorizationContext,
  ): Promise<PermissionDecision> {
    if (!requestPermission) {
      throw new SandboxViolationError(
        absolutePath,
        "ask-no-handler",
        `Policy for "${absolutePath}" requires interactive approval but no PermissionRequester is configured.`,
      );
    }

    let decision: PermissionDecision;
    try {
      decision = await requestPermission({
        agentName: authorizationContext.agentName,
        toolName: authorizationContext.toolName,
        operation,
        resource: absolutePath,
        reason: "policy-ask",
        signal: authorizationContext.signal,
      });
    } catch {
      throw new SandboxViolationError(
        absolutePath,
        "ask-aborted",
        `Permission request for "${absolutePath}" was aborted or threw.`,
      );
    }

    // Apply path-level memory for all positive decisions.
    // "allow" (one-shot) still adds the specific path to the session allow-list
    // so repeated accesses to the same path (e.g. paginated reads) don't
    // re-prompt. "allow-session" / "deny-session" do the same.
    if (decision === "allow" || decision === "allow-session" || decision === "deny-session") {
      const mode = operation === "fs.write" ? "write" : "read";
      const relativePattern = absolutePath.startsWith(`${sandboxCwd}/`)
        ? absolutePath.slice(sandboxCwd.length + 1)
        : absolutePath;

      if (decision === "allow" || decision === "allow-session") {
        sandbox.updatePolicy({ mode, allow: [relativePattern] });
      } else {
        sandbox.updatePolicy({ mode, deny: [relativePattern] });
      }
    }

    return decision;
  }

  async function authorizeOperation(
    inputPath: string,
    operation: "fs.read" | "fs.write",
    authorizationContext: AuthorizationContext,
  ): Promise<string> {
    const absolutePath = resolveJailed(inputPath);
    const policy = operation === "fs.write" ? writePolicy : readPolicy;
    const decision = decide(absolutePath, policy, sandboxCwd);

    if (decision === "allow") {
      return absolutePath;
    }

    if (decision === "deny") {
      const reason = operation === "fs.write" ? "write-denied" : "read-denied";
      throw new SandboxViolationError(
        absolutePath,
        reason,
        `${operation === "fs.write" ? "Write" : "Read"} access denied for "${absolutePath}".`,
      );
    }

    // decision === "ask"
    const promptDecision = await handleAsk(absolutePath, operation, authorizationContext);

    if (promptDecision === "deny" || promptDecision === "deny-session") {
      const reason = operation === "fs.write" ? "write-denied" : "read-denied";
      throw new SandboxViolationError(
        absolutePath,
        reason,
        `${operation === "fs.write" ? "Write" : "Read"} access denied by user for "${absolutePath}".`,
      );
    }

    return absolutePath;
  }

  const sandbox: Sandbox = {
    get cwd() {
      return sandboxCwd;
    },

    resolvePath(inputPath: string): string {
      return resolveJailed(inputPath);
    },

    canRead(inputPath: string): boolean {
      try {
        const absolutePath = resolveJailed(inputPath);
        return decide(absolutePath, readPolicy, sandboxCwd) === "allow";
      } catch {
        return false;
      }
    },

    canWrite(inputPath: string): boolean {
      try {
        const absolutePath = resolveJailed(inputPath);
        return decide(absolutePath, writePolicy, sandboxCwd) === "allow";
      } catch {
        return false;
      }
    },

    assertReadable(inputPath: string): string {
      const absolutePath = resolveJailed(inputPath);
      const decision = decide(absolutePath, readPolicy, sandboxCwd);

      if (decision === "deny" || decision === "ask") {
        throw new SandboxViolationError(
          absolutePath,
          "read-denied",
          `Read access denied for "${absolutePath}".`,
        );
      }

      return absolutePath;
    },

    assertWritable(inputPath: string): string {
      const absolutePath = resolveJailed(inputPath);
      const decision = decide(absolutePath, writePolicy, sandboxCwd);

      if (decision === "deny" || decision === "ask") {
        throw new SandboxViolationError(
          absolutePath,
          "write-denied",
          `Write access denied for "${absolutePath}".`,
        );
      }

      return absolutePath;
    },

    async authorizeRead(inputPath: string, authorizationContext: AuthorizationContext): Promise<string> {
      return authorizeOperation(inputPath, "fs.read", authorizationContext);
    },

    async authorizeWrite(inputPath: string, authorizationContext: AuthorizationContext): Promise<string> {
      return authorizeOperation(inputPath, "fs.write", authorizationContext);
    },

    updatePolicy(patch: PolicyPatch): void {
      const source = patch.mode === "write" ? writePolicy : readPolicy;

      const updatedPolicy: PathPolicy = {
        default: patch.default ?? source.default,
        allow: patch.allow
          ? [...(source.allow ?? []), ...patch.allow]
          : source.allow,
        deny: patch.deny
          ? [...(source.deny ?? []), ...patch.deny]
          : source.deny,
      };

      if (patch.mode === "write") {
        writePolicy = updatedPolicy;
      } else {
        readPolicy = updatedPolicy;
      }

      notifyPolicyChange();
    },

    getPolicy(): PolicySnapshot {
      return { read: readPolicy, write: writePolicy };
    },

    onPolicyChange(listener: PolicyChangeListener): () => void {
      policyChangeListeners.add(listener);
      return () => {
        policyChangeListeners.delete(listener);
      };
    },
  };

  return sandbox;
}
