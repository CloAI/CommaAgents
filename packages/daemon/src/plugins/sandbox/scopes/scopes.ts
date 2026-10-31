import { createSandbox, type PolicyPatch } from "@comma-agents/core/sandbox";
import type { RunPreparationContext, RunPreparationResult } from "../../runs";
import type { SandboxContext, SandboxScope } from "../state/state.types";
import { cleanupScopePermissions, requestPermission } from "../permissions";
import { DEFAULT_SANDBOX_OPTIONS } from "../sandbox.constants";

/**
 * Release permissions and scope resources exactly once.
 * @param {SandboxContext} context - Private feature state.
 * @param {SandboxScope} sandboxScope - Scope to release.
 * @returns {void} Nothing; removes the scope and pending permissions.
 * @internal
 */
export function disposeSandboxScope(
  context: SandboxContext,
  sandboxScope: SandboxScope,
): void {
  if (sandboxScope.disposed) return;
  sandboxScope.disposed = true;
  sandboxScope.detachAbort();
  cleanupScopePermissions(context, sandboxScope);
  if (context.scopes.get(sandboxScope.runId) === sandboxScope)
    context.scopes.delete(sandboxScope.runId);
}

/**
 * Supply a sandbox for one root or child strategy preparation.
 * @param {SandboxContext} context - Private feature state.
 * @param {RunPreparationContext} preparation - Execution scope settings.
 * @returns {RunPreparationResult} Sandbox loader input and scoped cleanup.
 * @internal
 */
export function prepareSandboxScope(
  context: SandboxContext,
  preparation: RunPreparationContext,
): RunPreparationResult {
  if (context.disposed) {
    throw new Error("Sandbox plugin has been disposed");
  }
  if (preparation.signal.aborted) {
    throw new DOMException("Run aborted", "AbortError");
  }
  if (context.scopes.has(preparation.runId) && !preparation.staged) {
    throw new Error(`Sandbox scope already prepared: ${preparation.runId}`);
  }
  const sandboxScope = createSandboxScope(context, preparation);
  const activate = (): void => {
    context.scopes.set(preparation.runId, sandboxScope);
  };
  if (!preparation.staged) activate();
  preparation.signal.addEventListener("abort", sandboxScope.onAbort, {
    once: true,
  });
  return {
    strategyInputs: { sandbox: sandboxScope.sandbox },
    ...(preparation.staged ? { activate } : {}),
    dispose: () => disposeSandboxScope(context, sandboxScope),
  };
}

/**
 * Construct a sandbox scope with default policies and cancellation wiring.
 * @param {SandboxContext} context - Private feature resources.
 * @param {RunPreparationContext} preparation - Execution identity and settings.
 * @returns {SandboxScope} Resources to register for this execution.
 * @internal
 */
function createSandboxScope(
  context: SandboxContext,
  preparation: RunPreparationContext,
): SandboxScope {
  const onAbort = (): void => disposeSandboxScope(context, sandboxScope);
  const sandboxScope: SandboxScope = {
    runId: preparation.runId,
    ...(preparation.parentRunId
      ? { parentRunId: preparation.parentRunId }
      : {}),
    signal: preparation.signal,
    disposed: false,
    onAbort,
    detachAbort: () => preparation.signal.removeEventListener("abort", onAbort),
    sandbox: createSandbox(
      { cwd: preparation.cwd, ...DEFAULT_SANDBOX_OPTIONS },
      {
        onAsk: (request) => requestPermission(context, sandboxScope, request),
        onPolicyChange: (snapshot): void => {
          if (context.disposed || sandboxScope.disposed) return;
          context.notifications.notify(sandboxScope.runId, {
            type: "run_policy_updated",
            runId: sandboxScope.runId,
            ...(sandboxScope.parentRunId
              ? { parentRunId: sandboxScope.parentRunId }
              : {}),
            tool: snapshot.toolName,
            policies: snapshot.policies,
            ts: new Date().toISOString(),
          });
        },
      },
    ),
  };
  return sandboxScope;
}

/**
 * Change policy only in a matching live root or child scope.
 * @param {SandboxContext} context - Private feature state.
 * @param {string} runId - Identifier of the requesting execution.
 * @param {PolicyPatch} patch - Updated path policy.
 * @param {string} toolName - Optional target tool.
 * @returns {boolean} Whether the target scope exists and was updated.
 * @internal
 */
export function updateSandboxPolicy(
  context: SandboxContext,
  runId: string,
  patch: PolicyPatch,
  toolName?: string,
): boolean {
  const sandboxScope = context.scopes.get(runId);
  if (!sandboxScope || sandboxScope.runId !== runId || sandboxScope.disposed) {
    return false;
  }
  sandboxScope.sandbox.updatePolicy(patch, toolName);
  return true;
}

/**
 * Release all sandbox scopes and their pending decisions when the plugin ends.
 * @param {SandboxContext} context - Private feature state.
 * @returns {void} Nothing; releases resources and prevents future preparation.
 * @internal
 */
export function disposeSandbox(context: SandboxContext): void {
  context.disposed = true;
  for (const sandboxScope of context.scopes.values())
    disposeSandboxScope(context, sandboxScope);
}
