// Auth bridge — bridges provider auth requests over the WebSocket.
//
// When the executor discovers that a provider has no credential, it
// calls the auth bridge which:
// 1. Sends `request_auth` to the client that started the run.
// 2. Returns a Promise that resolves when `resolveAuth()` is called
//    (triggered by the server when a `provide_auth` client message arrives).
// 3. Optionally persists the credential to the credential store.
// 4. Supports timeout and abort-signal cancellation.

import type { CredentialStore } from "../credentials/types";
import type { Credential } from "../protocol/shared";
import type { EventSink } from "./event-sink";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for creating an auth bridge. */
export interface CreateAuthBridgeOptions {
  /** EventSink for sending request_auth messages. */
  readonly sink: EventSink;
  /** The client ID that started the run (target for request_auth). */
  readonly clientId: string;
  /** The run ID this bridge belongs to. */
  readonly runId: string;
  /** Credential store for persistence. */
  readonly credentialStore: CredentialStore;
  /** Strategy name for scoped credential persistence. */
  readonly strategyName: string;
  /** Timeout in milliseconds for waiting for auth. 0 = no timeout. */
  readonly timeout?: number;
  /** AbortSignal for the run — rejects all pending requests on abort. */
  readonly abort?: AbortSignal;
}

/** A pending auth request waiting for user response. */
interface PendingAuth {
  readonly resolve: (credential: Credential) => void;
  readonly reject: (reason: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout> | undefined;
  readonly abortHandler: (() => void) | undefined;
}

/** The auth bridge instance. */
export interface AuthBridge {
  /**
   * Request authentication for a provider.
   *
   * Sends `request_auth` to the client that started the run and
   * returns a Promise that resolves when the client responds with
   * `provide_auth`.
   *
   * @param providerId - The provider that needs authentication.
   * @param envVar - Optional env var name hint for the client UI.
   * @returns The credential provided by the client.
   */
  requestAuth(providerId: string, envVar?: string): Promise<Credential>;

  /**
   * Resolve a pending auth request for a specific provider.
   * Called by the server when a `provide_auth` client message arrives.
   *
   * If `persist` is true, the credential is saved to the credential store
   * under the given `scope`.
   *
   * @returns `true` if a pending request was found and resolved.
   */
  resolveAuth(
    providerId: string,
    credential: Credential,
    scope: string,
    persist: boolean,
  ): Promise<boolean>;

  /**
   * Reject all pending auth requests and prevent future ones.
   * Called when the run is cancelled or completed.
   */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// createAuthBridge()
// ---------------------------------------------------------------------------

/**
 * Create an auth bridge for a single run.
 *
 * The bridge mediates between the executor (which needs credentials
 * to construct providers) and the client (which can prompt the user
 * for API keys, open OAuth flows, etc.).
 */
export function createAuthBridge(options: CreateAuthBridgeOptions): AuthBridge {
  const { sink, clientId, runId, credentialStore, strategyName, timeout = 0, abort } = options;

  /** providerId → pending auth request. */
  const pending = new Map<string, PendingAuth>();

  /** Once destroyed, reject all new requests immediately. */
  let destroyed = false;

  // -----------------------------------------------------------------------
  // requestAuth()
  // -----------------------------------------------------------------------

  function requestAuth(providerId: string, envVar?: string): Promise<Credential> {
    if (destroyed) {
      return Promise.reject(new DOMException("Auth bridge destroyed", "AbortError"));
    }

    if (abort?.aborted) {
      return Promise.reject(new DOMException("Run aborted", "AbortError"));
    }

    return new Promise<Credential>((resolve, reject) => {
      // Set up timeout if configured
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (timeout > 0) {
        timer = setTimeout(() => {
          pending.delete(providerId);
          reject(
            new Error(`Auth request for provider "${providerId}" timed out after ${timeout}ms`),
          );
        }, timeout);
      }

      // Set up abort handler
      let abortHandler: (() => void) | undefined;
      if (abort) {
        abortHandler = () => {
          if (timer) clearTimeout(timer);
          pending.delete(providerId);
          reject(new DOMException("Run aborted", "AbortError"));
        };
        abort.addEventListener("abort", abortHandler, { once: true });
      }

      // Store the pending request
      pending.set(providerId, { resolve, reject, timer, abortHandler });

      // Send request_auth to the specific client that started the run
      sink.send(clientId, {
        type: "request_auth" as const,
        providerId,
        runId,
        envVar,
        ts: new Date().toISOString(),
      });
    });
  }

  // -----------------------------------------------------------------------
  // resolveAuth()
  // -----------------------------------------------------------------------

  async function resolveAuth(
    providerId: string,
    credential: Credential,
    scope: string,
    persist: boolean,
  ): Promise<boolean> {
    const entry = pending.get(providerId);
    if (!entry) return false;

    // Clean up
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.abortHandler && abort) {
      abort.removeEventListener("abort", entry.abortHandler);
    }
    pending.delete(providerId);

    // Persist if requested
    if (persist) {
      await credentialStore.set(providerId, scope, credential);
    }

    entry.resolve(credential);
    return true;
  }

  // -----------------------------------------------------------------------
  // destroy()
  // -----------------------------------------------------------------------

  function destroy(): void {
    destroyed = true;
    const error = new DOMException("Auth bridge destroyed", "AbortError");

    for (const [, entry] of pending) {
      if (entry.timer) clearTimeout(entry.timer);
      if (entry.abortHandler && abort) {
        abort.removeEventListener("abort", entry.abortHandler);
      }
      entry.reject(error);
    }
    pending.clear();
  }

  return { requestAuth, resolveAuth, destroy };
}
