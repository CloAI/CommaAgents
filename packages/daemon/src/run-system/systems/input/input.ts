import type { InputCollector, InputRequest } from "@comma-agents/core";
import type {
  CleanupContext,
  DaemonSystem,
  SystemRunContext,
} from "../systems.types";

interface PendingInput {
  readonly resolve: (text: string) => void;
  readonly reject: (reason: unknown) => void;
  readonly abortHandler: () => void;
}

/**
 * Creates the input system that manages user input collection.
 *
 * This system:
 * - Stores the inputCollector in systemData for strategy loading
 * - Registers the resolveInput action for handling user responses
 *
 * @returns A DaemonSystem that handles input collection
 */
export function createInputSystem(): DaemonSystem {
  const destroyByRunId = new Map<string, () => void>();

  return {
    name: "input",

    onRunPrepare({
      run,
      sink,
      actions,
      systemData,
      abortSignal,
    }: SystemRunContext): void {
      const pending = new Map<string, PendingInput>();
      let destroyed = false;

      const removePending = (agentName: string, entry: PendingInput): void => {
        abortSignal.removeEventListener("abort", entry.abortHandler);
        pending.delete(agentName);
      };

      const inputCollector: InputCollector = async (
        request: InputRequest,
      ): Promise<string> => {
        if (destroyed) {
          throw new DOMException("Input system cleaned up", "AbortError");
        }
        if (abortSignal.aborted) {
          throw new DOMException("Run aborted", "AbortError");
        }

        const { agentName, prompt } = request;
        return new Promise<string>((resolve, reject) => {
          let entry: PendingInput;
          const abortHandler = (): void => {
            removePending(agentName, entry);
            reject(new DOMException("Run aborted", "AbortError"));
          };

          entry = { resolve, reject, abortHandler };
          abortSignal.addEventListener("abort", abortHandler, { once: true });
          pending.set(agentName, entry);

          sink.broadcast(run.id, {
            type: "request_input",
            runId: run.id,
            agentName,
            prompt,
            ts: new Date().toISOString(),
          });
        });
      };

      const destroy = (): void => {
        destroyed = true;
        const error = new DOMException("Input system cleaned up", "AbortError");
        for (const [agentName, entry] of pending) {
          removePending(agentName, entry);
          entry.reject(error);
        }
      };

      destroyByRunId.set(run.id, destroy);
      systemData.set("inputCollector", inputCollector);

      actions.register("resolveInput", run.id, (agentName, text): boolean => {
        const entry = pending.get(agentName);
        if (!entry) return false;

        removePending(agentName, entry);
        entry.resolve(text);
        return true;
      });
    },

    onRunCleanup({ run, actions }: CleanupContext): void {
      destroyByRunId.get(run.id)?.();
      destroyByRunId.delete(run.id);
      actions.unregisterAll(run.id);
    },
  };
}
