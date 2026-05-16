import { resolve } from "node:path";
import { createGuard } from "../guard/guard";
import type { Guard, GuardCallbacks, Policy } from "../guard/guard.types";
import { buildDefaultPolicies } from "../guard/policies";
import type { Sandbox, SandboxConfig } from "./sandbox.types";

/**
 * Create a Sandbox — a thin registry that lazily creates per-tool Guard
 * instances. Each guard handles path resolution, jail enforcement, policy
 * chain evaluation, and "ask" dispatch.
 *
 * @param config - Sandbox configuration. Missing fields use sensible defaults.
 * @param callbacks - onAsk / onPolicyChange handlers shared across all guards.
 */
export function createSandbox(
  config: Partial<SandboxConfig> = {},
  callbacks?: GuardCallbacks,
): Sandbox {
  const cwd = config.cwd ?? process.cwd();
  const sandboxCwd = resolve(cwd);
  const jail = config.jail ?? false;
  const allowAbsolutePaths = config.allowAbsolutePaths ?? true;
  const forbiddenGlobs = config.forbiddenGlobs ?? [];
  const read = config.read ?? { default: "allow" };
  const write = config.write ?? { default: "allow" };

  const guards = new Map<string, Guard>();
  const guardsView: ReadonlyMap<string, Guard> = guards;

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
      allowAbsolutePaths,
      jail,
      buildDefaultPolicies(forbiddenGlobs, read, write, sandboxCwd),
      callbacks,
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

  return {
    cwd: sandboxCwd,
    guards: guardsView,
    guardFor,
  };
}
