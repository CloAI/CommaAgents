import type { InputCollector, InputRequest } from "@comma-agents/core";

import type { EventSink } from "./event-sink";

// Types

/** Options for creating an input bridge. */
export interface CreateInputBridgeOptions {
  /** EventSink for broadcasting request_input messages. */
  readonly sink: EventSink;
  /** The run ID this bridge belongs to. */
  readonly runId: string;
  /** Timeout in milliseconds for waiting for user input. 0 = no timeout. */
  readonly timeout?: number;
  /** AbortSignal for the run — rejects all pending requests on abort. */
  readonly abort?: AbortSignal;
}

/** A pending input request waiting for user response. */
interface PendingInput {
  readonly resolve: (text: string) => void;
  readonly reject: (reason: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout> | undefined;
  readonly abortHandler: (() => void) | undefined;
}

/** The input bridge instance. */
export interface InputBridge {
  /**
   * InputCollector function that can be passed to `loadStrategy()`.
   * When invoked by a UserAgent, it broadcasts `request_input` and
   * returns a Promise that resolves when the user responds.
   */
  readonly collector: InputCollector;

  /**
   * Resolve a pending input request for a specific agent.
   * Called by the server when a `user_input` client message arrives.
   *
   * @returns `true` if a pending request was found and resolved.
   */
  resolveInput(agentName: string, text: string): boolean;

  /**
   * Reject all pending input requests and prevent future ones.
   * Called when the run is cancelled or completed.
   */
  destroy(): void;
}

// createInputBridge()

/**
 * Create an input bridge for a single run.
 *
 * The bridge creates an `InputCollector` compatible with
 * `LoadStrategyOptions.inputCollector`. When a UserAgent calls it,
 * the bridge broadcasts a `request_input` message to all subscribers
 * of the run, then waits for `resolveInput()` to be called.
 */
export function createInputBridge(
  options: CreateInputBridgeOptions,
): InputBridge {
  const { sink, runId, timeout = 0, abort } = options;

  /** agentName → pending request. */
  const pending = new Map<string, PendingInput>();

  /** Once destroyed, reject all new requests immediately. */
  let destroyed = false;

  // -- InputCollector implementation --

  const collector: InputCollector = (
    request: InputRequest,
  ): Promise<string> => {
    if (destroyed) {
      return Promise.reject(
        new DOMException("Input bridge destroyed", "AbortError"),
      );
    }

    // If already aborted, reject immediately
    if (abort?.aborted) {
      return Promise.reject(new DOMException("Run aborted", "AbortError"));
    }

    const { agentName, prompt } = request;

    return new Promise<string>((resolve, reject) => {
      // Set up timeout if configured
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (timeout > 0) {
        timer = setTimeout(() => {
          pending.delete(agentName);
          reject(
            new Error(
              `Input request for agent "${agentName}" timed out after ${timeout}ms`,
            ),
          );
        }, timeout);
      }

      // Set up abort handler
      let abortHandler: (() => void) | undefined;
      if (abort) {
        abortHandler = () => {
          if (timer) clearTimeout(timer);
          pending.delete(agentName);
          reject(new DOMException("Run aborted", "AbortError"));
        };
        abort.addEventListener("abort", abortHandler, { once: true });
      }

      // Store the pending request
      pending.set(agentName, { resolve, reject, timer, abortHandler });

      // Broadcast request_input to all subscribers of this run
      sink.broadcast(runId, {
        type: "request_input" as const,
        runId,
        agentName,
        prompt,
        ts: new Date().toISOString(),
      });
    });
  };

  // -- resolveInput() --

  function resolveInput(agentName: string, text: string): boolean {
    const entry = pending.get(agentName);
    if (!entry) return false;

    // Clean up
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.abortHandler && abort) {
      abort.removeEventListener("abort", entry.abortHandler);
    }
    pending.delete(agentName);

    entry.resolve(text);
    return true;
  }

  // -- destroy() --

  function destroy(): void {
    destroyed = true;
    const error = new DOMException("Input bridge destroyed", "AbortError");

    for (const [_agentName, entry] of pending) {
      if (entry.timer) clearTimeout(entry.timer);
      if (entry.abortHandler && abort) {
        abort.removeEventListener("abort", entry.abortHandler);
      }
      entry.reject(error);
    }
    pending.clear();
  }

  return { collector, resolveInput, destroy };
}
