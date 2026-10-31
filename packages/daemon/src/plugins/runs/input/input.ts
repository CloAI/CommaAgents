import type { InputCollector, InputRequest } from "@comma-agents/core";
import type { RunEntry, RunsContext } from "../state/state.types";
import { RunPhase } from "../state/state.schemas";
import { operationError, runError, RunErrorCode } from "../errors";
import { switchStrategy } from "../switching/switching";
import { saveUserMessage } from "../messages";
/**
 *  Collect human input without storing internal input requests in conversation history.
 * @param {RunsContext} context - Private runs state.
 * @param {RunEntry} entry - Run that owns the operation.
 * @returns {InputCollector} Human-input collector bound to this run.
 * @internal
 */
export function createRunInputCollector(
  context: RunsContext,
  entry: RunEntry,
): InputCollector {
  return ({ agentName, prompt, signal }: InputRequest): Promise<string> => {
    entry.controller.signal.throwIfAborted();
    signal?.throwIfAborted();
    if (entry.initialInput?.agentName === agentName) {
      const text = entry.initialInput.text;
      entry.initialInput = null;
      return Promise.resolve(text);
    }
    const pendingSwitch = entry.pendingStrategySwitch;
    if (pendingSwitch !== null) {
      entry.pendingStrategySwitch = null;
      // Switching stops this run, which rejects the input request below; the user's next message goes to the new strategy.
      void switchStrategy(context, {
        runId: entry.runId,
        ...pendingSwitch,
        stop: true,
      }).catch((switchError: unknown) => {
        context.notifications.notify(entry.runId, {
          type: "run_error",
          runId: entry.runId,
          error: runError(
            operationError(
              RunErrorCode.PREPARATION_ERROR,
              entry.runId,
              switchError,
            ),
          ),
        });
      });
    }
    const inputId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      function cleanup(): void {
        entry.controller.signal.removeEventListener("abort", stop);
        signal?.removeEventListener("abort", stop);
      }
      function stop(): void {
        entry.pendingInput.delete(inputId);
        cleanup();
        context.notifications.notify(entry.runId, {
          type: "run_input_resolved",
          runId: entry.runId,
          inputId,
        });
        reject(new DOMException("Input stopped", "AbortError"));
      }
      entry.pendingInput.set(inputId, {
        agentName,
        prompt,
        resolving: false,
        resolve,
        reject,
        cleanup,
      });
      entry.controller.signal.addEventListener("abort", stop, { once: true });
      signal?.addEventListener("abort", stop, { once: true });
      context.notifications.notify(entry.runId, {
        type: "run_input_requested",
        runId: entry.runId,
        inputId,
        agentName,
        prompt,
      });
    });
  };
}
/**
 *  Save an accepted human answer before allowing execution to consume it.
 * @param {RunsContext} context - Private runs state.
 * @param {string} runId - Stable conversation identity.
 * @param {string} inputId - Pending human-input identity.
 * @param {string} text - User-supplied text.
 * @returns {Promise<void>} Resolves after the answer is persisted and delivered.
 * @internal
 */
export async function resolveRunInput(
  context: RunsContext,
  runId: string,
  inputId: string,
  text: string,
): Promise<void> {
  const entry = context.runs.get(runId);
  const pending = entry?.pendingInput.get(inputId);
  if (
    entry === undefined ||
    entry.state.phase !== RunPhase.running ||
    pending === undefined ||
    pending.resolving
  ) {
    throw runError({
      code: RunErrorCode.INPUT_NOT_FOUND,
      metadata: { runId, inputId },
    });
  }
  pending.resolving = true;
  await saveUserMessage(context, runId, text);
  if (!entry.pendingInput.has(inputId)) {
    throw runError({
      code: RunErrorCode.INPUT_NOT_FOUND,
      metadata: { runId, inputId },
    });
  }
  entry.pendingInput.delete(inputId);
  pending.cleanup();
  context.notifications.notify(runId, {
    type: "run_input_resolved",
    runId,
    inputId,
  });
  pending.resolve(text);
}
