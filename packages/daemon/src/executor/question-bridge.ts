import type { EventSink } from "./event-sink";

/** Options for creating a question bridge. */
export interface CreateQuestionBridgeOptions {
  /** EventSink for broadcasting request_question messages. */
  readonly sink: EventSink;
  /** The run ID this bridge belongs to. */
  readonly runId: string;
  /** Timeout in milliseconds for waiting for user response. 0 = no timeout. */
  readonly timeout?: number;
  /** AbortSignal for the run — rejects all pending requests on abort. */
  readonly abort?: AbortSignal;
}

/** A pending question request waiting for user response. */
interface PendingQuestion {
  readonly resolve: (response: string) => void;
  readonly reject: (reason: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout> | undefined;
  readonly abortHandler: (() => void) | undefined;
}

/** The question bridge instance. */
export interface QuestionBridge {
  /**
   * Question requester function. When invoked, it broadcasts `request_question`
   * and returns a Promise that resolves when the user sends a `question_response`.
   */
  readonly requester: (request: {
    readonly agentName: string;
    readonly toolName: string;
    readonly question: string;
  }) => Promise<string>;

  /**
   * Resolve a pending question request by its `requestId`.
   * Called by the server when a `question_response` client message arrives.
   *
   * @returns `true` if a pending request was found and resolved.
   */
  resolveQuestion(requestId: string, response: string): boolean;

  /**
   * Reject all pending question requests and prevent future ones.
   */
  destroy(): void;
}

/**
 * Create a question bridge for a single run.
 */
export function createQuestionBridge(
  options: CreateQuestionBridgeOptions,
): QuestionBridge {
  const { sink, runId, timeout = 0, abort } = options;

  /** requestId → pending response. */
  const pending = new Map<string, PendingQuestion>();

  /** Once destroyed, reject all new requests immediately. */
  let destroyed = false;

  const requester = (request: {
    readonly agentName: string;
    readonly toolName: string;
    readonly question: string;
  }): Promise<string> => {
    if (destroyed) {
      return Promise.reject(
        new DOMException("Question bridge destroyed", "AbortError"),
      );
    }

    if (abort?.aborted) {
      return Promise.reject(new DOMException("Run aborted", "AbortError"));
    }

    const requestId = crypto.randomUUID();

    return new Promise<string>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (timeout > 0) {
        timer = setTimeout(() => {
          pending.delete(requestId);
          reject(
            new Error(
              `Question request ${requestId} timed out after ${timeout}ms`,
            ),
          );
        }, timeout);
      }

      let abortHandler: (() => void) | undefined;
      if (abort) {
        abortHandler = () => {
          if (timer) clearTimeout(timer);
          pending.delete(requestId);
          reject(new DOMException("Run aborted", "AbortError"));
        };
        abort.addEventListener("abort", abortHandler, { once: true });
      }

      pending.set(requestId, { resolve, reject, timer, abortHandler });

      // Broadcast request_question to all subscribers of this run
      sink.broadcast(runId, {
        type: "request_question" as const,
        runId,
        requestId,
        agentName: request.agentName,
        toolName: request.toolName,
        question: request.question,
        ts: new Date().toISOString(),
      });
    });
  };

  function resolveQuestion(requestId: string, response: string): boolean {
    const entry = pending.get(requestId);
    if (!entry) return false;

    if (entry.timer) clearTimeout(entry.timer);
    if (entry.abortHandler && abort) {
      abort.removeEventListener("abort", entry.abortHandler);
    }
    pending.delete(requestId);

    entry.resolve(response);
    return true;
  }

  function destroy(): void {
    destroyed = true;
    const error = new DOMException("Question bridge destroyed", "AbortError");

    for (const [_requestId, entry] of pending) {
      if (entry.timer) clearTimeout(entry.timer);
      if (entry.abortHandler && abort) {
        abort.removeEventListener("abort", entry.abortHandler);
      }
      entry.reject(error);
    }
    pending.clear();
  }

  return { requester, resolveQuestion, destroy };
}
