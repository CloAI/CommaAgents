import type {
  PermissionDecision,
  PermissionRequest,
  PermissionRequester,
} from "@comma-agents/core";

import type { EventSink } from "./event-sink";

// Types

/** Options for creating a permission bridge. */
export interface CreatePermissionBridgeOptions {
  /** EventSink for broadcasting request_permission messages. */
  readonly sink: EventSink;
  /** The run ID this bridge belongs to. */
  readonly runId: string;
  /** Timeout in milliseconds for waiting for a decision. 0 = no timeout. */
  readonly timeout?: number;
  /** AbortSignal for the run — rejects all pending requests on abort. */
  readonly abort?: AbortSignal;
}

/** A pending permission request waiting for a decision. */
interface PendingPermission {
  readonly resolve: (decision: PermissionDecision) => void;
  readonly reject: (reason: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout> | undefined;
  readonly abortHandler: (() => void) | undefined;
}

/** The permission bridge instance. */
export interface PermissionBridge {
  /**
   * PermissionRequester function that can be passed to `inSandbox()`. 
   * When invoked by the sandbox (policy resolves to `"ask"`), it broadcasts
   * `request_permission` and returns a Promise that resolves when the client
   * sends a `permission_decision` response.
   */
  readonly requester: PermissionRequester;

  /**
   * Resolve a pending permission request by its `requestId`.
   * Called by the server when a `permission_decision` client message arrives.
   *
   * @returns `true` if a pending request was found and resolved.
   */
  resolvePermission(requestId: string, decision: PermissionDecision): boolean;

  /**
   * Reject all pending permission requests and prevent future ones.
   * Called when the run is cancelled or completed.
   */
  destroy(): void;
}

// createPermissionBridge()

/**
 * Create a permission bridge for a single run.
 *
 * The bridge creates a `PermissionRequester` compatible with
 * `SandboxDependencies.requestPermission`. When the sandbox calls it
 * (policy is `"ask"`), the bridge broadcasts a `request_permission` message
 * to all subscribers of the run, then waits for `resolvePermission()` to be called.
 */
export function createPermissionBridge(
  options: CreatePermissionBridgeOptions,
): PermissionBridge {
  const { sink, runId, timeout = 0, abort } = options;

  /** requestId → pending decision. */
  const pending = new Map<string, PendingPermission>();

  /** Once destroyed, reject all new requests immediately. */
  let destroyed = false;

  // -- PermissionRequester implementation --

  const requester: PermissionRequester = (
    request: PermissionRequest,
  ): Promise<PermissionDecision> => {
    if (destroyed) {
      return Promise.reject(
        new DOMException("Permission bridge destroyed", "AbortError"),
      );
    }

    // If the run is already aborted, reject immediately
    if (abort?.aborted) {
      return Promise.reject(new DOMException("Run aborted", "AbortError"));
    }

    // If the tool provided its own signal and it is already aborted, reject
    if (request.signal?.aborted) {
      return Promise.reject(new DOMException("Tool aborted", "AbortError"));
    }

    // Generate a unique correlation ID for this specific request
    const requestId = crypto.randomUUID();

    return new Promise<PermissionDecision>((resolve, reject) => {
      // Set up timeout if configured
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (timeout > 0) {
        timer = setTimeout(() => {
          pending.delete(requestId);
          reject(
            new Error(
              `Permission request ${requestId} timed out after ${timeout}ms`,
            ),
          );
        }, timeout);
      }

      // Race against the run abort signal
      let abortHandler: (() => void) | undefined;
      if (abort) {
        abortHandler = () => {
          if (timer) clearTimeout(timer);
          pending.delete(requestId);
          reject(new DOMException("Run aborted", "AbortError"));
        };
        abort.addEventListener("abort", abortHandler, { once: true });
      }

      // Also race against the tool-level signal (may be different from run signal)
      if (request.signal && request.signal !== abort) {
        request.signal.addEventListener(
          "abort",
          () => {
            if (timer) clearTimeout(timer);
            if (abortHandler && abort)
              abort.removeEventListener("abort", abortHandler);
            pending.delete(requestId);
            reject(new DOMException("Tool aborted", "AbortError"));
          },
          { once: true },
        );
      }

      // Store the pending request
      pending.set(requestId, { resolve, reject, timer, abortHandler });

      // Broadcast request_permission to all subscribers of this run
      sink.broadcast(runId, {
        type: "request_permission" as const,
        runId,
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

  // -- resolvePermission() --

  function resolvePermission(
    requestId: string,
    decision: PermissionDecision,
  ): boolean {
    const entry = pending.get(requestId);
    if (!entry) return false;

    // Clean up
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.abortHandler && abort) {
      abort.removeEventListener("abort", entry.abortHandler);
    }
    pending.delete(requestId);

    entry.resolve(decision);
    return true;
  }

  // -- destroy() --

  function destroy(): void {
    destroyed = true;
    const error = new DOMException("Permission bridge destroyed", "AbortError");

    for (const [_requestId, entry] of pending) {
      if (entry.timer) clearTimeout(entry.timer);
      if (entry.abortHandler && abort) {
        abort.removeEventListener("abort", entry.abortHandler);
      }
      entry.reject(error);
    }
    pending.clear();
  }

  return { requester, resolvePermission, destroy };
}
