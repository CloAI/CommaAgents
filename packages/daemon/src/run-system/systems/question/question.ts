import type {
  CleanupContext,
  DaemonSystem,
  SystemRunContext,
} from "../systems.types";
import type { QuestionRequester } from "./question.types";

interface PendingQuestion {
  readonly resolve: (response: string) => void;
  readonly reject: (reason: unknown) => void;
  readonly abortHandler: () => void;
}

/**
 * Creates the question system that manages question requests.
 *
 * This system:
 * - Stores the questionRequester in systemData for sandbox callbacks
 * - Registers the resolveQuestion action for handling user responses
 *
 * @returns A DaemonSystem that handles question requests
 */
export function createQuestionSystem(): DaemonSystem {
  const destroyByRunId = new Map<string, () => void>();

  return {
    name: "question",

    onRunPrepare({
      run,
      sink,
      abortSignal,
      systemData,
      actions,
    }: SystemRunContext): void {
      const pending = new Map<string, PendingQuestion>();
      let destroyed = false;

      const removePending = (
        requestId: string,
        entry: PendingQuestion,
      ): void => {
        abortSignal.removeEventListener("abort", entry.abortHandler);
        pending.delete(requestId);
      };

      const questionRequester: QuestionRequester = (
        request,
      ): Promise<string> => {
        if (destroyed) {
          return Promise.reject(
            new DOMException("Question system cleaned up", "AbortError"),
          );
        }
        if (abortSignal.aborted) {
          return Promise.reject(new DOMException("Run aborted", "AbortError"));
        }

        const requestId = crypto.randomUUID();
        return new Promise<string>((resolve, reject) => {
          let entry: PendingQuestion;
          const abortHandler = (): void => {
            removePending(requestId, entry);
            reject(new DOMException("Run aborted", "AbortError"));
          };

          entry = { resolve, reject, abortHandler };
          abortSignal.addEventListener("abort", abortHandler, { once: true });
          pending.set(requestId, entry);

          sink.broadcast(run.id, {
            type: "request_question",
            runId: run.id,
            requestId,
            agentName: request.agentName,
            toolName: request.toolName,
            question: request.question,
            ts: new Date().toISOString(),
          });
        });
      };

      const destroy = (): void => {
        destroyed = true;
        const error = new DOMException(
          "Question system cleaned up",
          "AbortError",
        );
        for (const [requestId, entry] of pending) {
          removePending(requestId, entry);
          entry.reject(error);
        }
      };

      destroyByRunId.set(run.id, destroy);
      systemData.set("questionRequester", questionRequester);

      actions.register(
        "resolveQuestion",
        run.id,
        (questionRequestId, response): boolean => {
          const entry = pending.get(questionRequestId);
          if (!entry) return false;

          removePending(questionRequestId, entry);
          entry.resolve(response);
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
