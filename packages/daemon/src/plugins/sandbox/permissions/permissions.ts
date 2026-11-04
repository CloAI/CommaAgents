import type {
  PermissionDecision,
  PermissionRequest,
} from "@comma-agents/core/sandbox";
import type {
  PendingPermission,
  SandboxContext,
  SandboxScope,
} from "../state/state.types";
import type { SandboxPermissionRequest } from "../sandbox.notifications";

function removePermission(
  context: SandboxContext,
  requestId: string,
): PendingPermission | undefined {
  const pending = context.pending.get(requestId);

  if (!pending) {
    return undefined;
  }
  context.pending.delete(requestId);
  pending.detachAbort();
  return pending;
}

/**
 * Request a decision while observing scope and tool cancellation.
 * @param {SandboxContext} context - Private feature state.
 * @param {SandboxScope} sandboxScope - Execution awaiting permission.
 * @param {PermissionRequest} request - Tool authorization details.
 * @returns {Promise<PermissionDecision>} Decision or cancellation rejection.
 * @internal
 */
export function requestPermission(
  context: SandboxContext,
  sandboxScope: SandboxScope,
  request: PermissionRequest,
): Promise<PermissionDecision> {
  if (
    context.disposed ||
    sandboxScope.disposed ||
    sandboxScope.signal.aborted ||
    request.signal?.aborted
  ) {
    return Promise.reject(
      new DOMException("Permission request stopped", "AbortError"),
    );
  }
  const requestId = crypto.randomUUID();
  const notification: SandboxPermissionRequest = {
    requestId,
    type: "run_permission_requested",
    runId: sandboxScope.runId,
    agentName: request.agentName,
    ...(sandboxScope.parentRunId
      ? { parentRunId: sandboxScope.parentRunId }
      : {}),
    ...(request.toolName ? { toolName: request.toolName } : {}),
    operation: request.operation,
    resource: request.resource,
    reason: request.reason,
    ...(request.details ? { details: request.details } : {}),
    ts: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const toolSignal =
      request.signal !== sandboxScope.signal ? request.signal : undefined;

    const onAbort = (): void => {
      removePermission(context, requestId)?.reject(
        new DOMException("Permission request stopped", "AbortError"),
      );
    };
    const detachAbort = (): void => {
      sandboxScope.signal.removeEventListener("abort", onAbort);
      toolSignal?.removeEventListener("abort", onAbort);
    };
    context.pending.set(requestId, {
      sandboxScope,
      request: notification,
      resolve,
      reject,
      detachAbort,
    });
    sandboxScope.signal.addEventListener("abort", onAbort, { once: true });
    toolSignal?.addEventListener("abort", onAbort, { once: true });
    context.notifications.notify(sandboxScope.runId, notification);
  });
}

/**
 * Resolve only a pending request belonging to the supplied run.
 * @param {SandboxContext} context - Private feature state.
 * @param {string} runId - Identifier of the requesting execution.
 * @param {string} requestId - Pending permission identifier.
 * @param {PermissionDecision} decision - User decision.
 * @returns {boolean} Whether a matching request was resolved.
 * @internal
 */
export function resolvePermission(
  context: SandboxContext,
  runId: string,
  requestId: string,
  decision: PermissionDecision,
): boolean {
  if (context.pending.get(requestId)?.request.runId !== runId) {
    return false;
  }

  const pending = removePermission(context, requestId);
  if (!pending) {
    return false;
  }
  pending.resolve(decision);
  return true;
}

/**
 * Reject unresolved decisions when their execution scope ends.
 * @param {SandboxContext} context - Private feature state.
 * @param {SandboxScope} sandboxScope - Scope whose permissions are released.
 * @returns {void} Nothing; rejects and removes pending permissions.
 * @internal
 */
export function cleanupScopePermissions(
  context: SandboxContext,
  sandboxScope: SandboxScope,
): void {
  for (const [requestId, pending] of context.pending) {
    if (pending.sandboxScope === sandboxScope) {
      removePermission(context, requestId)?.reject(
        new DOMException("Sandbox scope cleaned up", "AbortError"),
      );
    }
  }
}
