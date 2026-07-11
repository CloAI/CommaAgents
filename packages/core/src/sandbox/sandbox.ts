import { resolve } from "node:path";
import { createGuard } from "../guard/guard";
import type { Guard, GuardCallbacks, Policy } from "../guard/guard.types";
import { buildDefaultPolicies, pathPolicy } from "../guard/policies";
import type { PolicyPatch, Sandbox, SandboxOptions } from "./sandbox.types";

/**
 * Create a sandbox that lazily provides one access guard per tool.
 * Each guard handles path resolution, workspace boundaries, policy
 * chain evaluation, and "ask" dispatch.
 *
 * @param options - Workspace boundary and read/write policy options.
 * @param callbacks - onAsk / onPolicyChange handlers shared across all guards.
 * @example
 * ```ts
 * const sandbox = createSandbox({
 *   cwd: process.cwd(),
 *   outsideWorkspace: "deny",
 *   write: { default: "ask" },
 * });
 * ```
 */
export function createSandbox(
  options: SandboxOptions,
  callbacks?: GuardCallbacks,
): Sandbox {
  const sandboxCwd = resolve(options.cwd);
  const outsideWorkspace = options.outsideWorkspace ?? "deny";
  const absolutePaths = options.absolutePaths ?? "deny";
  const forbiddenGlobs = options.forbiddenGlobs ?? [];
  const read = options.read ?? { default: "allow" };
  const write = options.write ?? { default: "allow" };
  const trashMetadata = options.trashMetadata;

  const guards = new Map<string, Guard>();
  const sharedPolicies = new Map<string, Policy>();
  const policiesByTool = new Map<string, Map<string, Policy>>();

  function guardFor(toolName: string, toolPolicies?: readonly Policy[]): Guard {
    const existing = guards.get(toolName);
    if (existing) {
      // Add tool policies to existing guard (idempotent — addPolicy deduplicates)
      if (toolPolicies) {
        for (const policy of toolPolicies) {
          existing.addPolicy(policy);
        }
      }
      return existing;
    }

    const guard = createGuard(
      toolName,
      sandboxCwd,
      absolutePaths,
      outsideWorkspace,
      [
        ...buildDefaultPolicies(forbiddenGlobs, read, write, sandboxCwd),
        ...sharedPolicies.values(),
        ...(policiesByTool.get(toolName)?.values() ?? []),
      ],
      callbacks,
      trashMetadata,
    );

    // Add tool-specific policies on creation
    if (toolPolicies) {
      for (const policy of toolPolicies) {
        guard.addPolicy(policy);
      }
    }

    guards.set(toolName, guard);
    return guard;
  }

  function updatePolicy(patch: PolicyPatch, toolName?: string): void {
    const policy = pathPolicy(
      patch.mode,
      {
        default: patch.default ?? "ask",
        allow: patch.allow,
        deny: patch.deny,
      },
      sandboxCwd,
    );

    if (toolName) {
      const toolPolicies =
        policiesByTool.get(toolName) ?? new Map<string, Policy>();
      toolPolicies.set(policy.name, policy);
      policiesByTool.set(toolName, toolPolicies);
      guardFor(toolName).addPolicy(policy);
      return;
    }

    sharedPolicies.set(policy.name, policy);
    for (const [guardToolName, guard] of guards) {
      const toolPolicy = policiesByTool.get(guardToolName)?.get(policy.name);
      if (!toolPolicy) guard.addPolicy(policy);
    }
  }

  return {
    cwd: sandboxCwd,
    guardFor,
    updatePolicy,
  };
}
