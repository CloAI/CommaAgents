import type {
  PermissionDecision,
  PermissionRequest,
  PermissionRequester,
} from "@comma-agents/core";
import type {
  CleanupContext,
  DaemonSystem,
  SystemRunContext,
} from "../systems.types";

interface PendingPermission {
  readonly resolve: (decision: PermissionDecision) => void;
  readonly reject: (reason: unknown) => void;
  readonly runAbortHandler: () => void;
  readonly toolSignal: AbortSignal | undefined;
  readonly toolAbortHandler: (() => void) | undefined;
}

/**
 * Creates the permission system that manages permission requests.
 *
 * This system:
 * - Stores the permissionRequester in systemData for sandbox callbacks
 * - Registers the resolvePermission action for handling user decisions
 *
 * @returns A DaemonSystem that handles permission requests
 */
export function createPermissionSystem(): DaemonSystem {
  const destroyByRunId = new Map<string, () => void>();

  return {
    name: "permission",

    onRunPrepare({
      run,
      sink,
      systemData,
      actions,
      abortSignal,
    }: SystemRunContext): void {
      const pending = new Map<string, PendingPermission>();
      let destroyed = false;

      const removePending = (
        requestId: string,
        entry: PendingPermission,
      ): void => {
        abortSignal.removeEventListener("abort", entry.runAbortHandler);
        if (entry.toolSignal && entry.toolAbortHandler) {
          entry.toolSignal.removeEventListener("abort", entry.toolAbortHandler);
        }
        pending.delete(requestId);
      };

      const permissionRequester: PermissionRequester = (
        request: PermissionRequest,
      ): Promise<PermissionDecision> => {
        if (destroyed) {
          return Promise.reject(
            new DOMException("Permission system cleaned up", "AbortError"),
          );
        }
        if (abortSignal.aborted) {
          return Promise.reject(new DOMException("Run aborted", "AbortError"));
        }
        if (request.signal?.aborted) {
          return Promise.reject(new DOMException("Tool aborted", "AbortError"));
        }

        const requestId = crypto.randomUUID();
        return new Promise<PermissionDecision>((resolve, reject) => {
          let entry: PendingPermission;
          const runAbortHandler = (): void => {
            removePending(requestId, entry);
            reject(new DOMException("Run aborted", "AbortError"));
          };
          const toolSignal =
            request.signal !== abortSignal ? request.signal : undefined;
          const toolAbortHandler = toolSignal
            ? (): void => {
                removePending(requestId, entry);
                reject(new DOMException("Tool aborted", "AbortError"));
              }
            : undefined;

          entry = {
            resolve,
            reject,
            runAbortHandler,
            toolSignal,
            toolAbortHandler,
          };
          abortSignal.addEventListener("abort", runAbortHandler, {
            once: true,
          });
          toolSignal?.addEventListener("abort", toolAbortHandler!, {
            once: true,
          });
          pending.set(requestId, entry);

          sink.broadcast(run.id, {
            type: "request_permission",
            runId: run.id,
            requestId,
            agentName: request.agentName,
            toolName: request.toolName,
            operation: request.operation,
            resource: request.resource,
            reason: request.reason,
            details: request.details,
            ts: new Date().toISOString(),
          });
        });
      };

      const destroy = (): void => {
        destroyed = true;
        const error = new DOMException(
          "Permission system cleaned up",
          "AbortError",
        );
        for (const [requestId, entry] of pending) {
          removePending(requestId, entry);
          entry.reject(error);
        }
      };

      destroyByRunId.set(run.id, destroy);
      systemData.set("permissionRequester", permissionRequester);

      actions.register(
        "resolvePermission",
        run.id,
        (permissionRequestId, decision): boolean => {
          const entry = pending.get(permissionRequestId);
          if (!entry) return false;

          removePending(permissionRequestId, entry);
          entry.resolve(decision);
          return true;
        },
      );
    },

    onRunCleanup({ run, actions }: CleanupContext): void {
      destroyByRunId.get(run.id)?.();
      destroyByRunId.delete(run.id);
      actions.unregisterAll(run.id);
    },
  };
}
