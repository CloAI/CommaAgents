import type { RunOutcome, RunExecutionHandle } from "../runs.types";
import type { RunEntry, RunsContext } from "../state/state.types";
import { RunPhase, RunOutcomeStatus } from "../state/state.schemas";
import { publishRunState, getRunSnapshot } from "../state/state";
import { runError, operationError, RunErrorCode } from "../errors";
import { cleanupRunEntry } from "../preparation/resources/resources";
import { interruptAgentMessages, saveUserMessage } from "../messages";
import { initialInputAgent, resultSummary } from "./execution.utils";
import { saveCopyCheckpoint } from "../copying/copying";
import { persistRunWrite } from "../history/persistence";
/**
 *  Reserve prepared state synchronously and execute through one path for all conversations.
 * @param {RunsContext} context - Private runs state.
 * @param {string} runId - Stable conversation identity.
 * @param {string} input - Input for this execution.
 * @returns {RunExecutionHandle} Handle whose completion follows finalization.
 * @internal
 */
export function beginRunExecution(
  context: RunsContext,
  runId: string,
  input: string,
): RunExecutionHandle {
  if (context.operations.has(runId)) {
    throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
  }
  const entry = context.runs.get(runId);
  if (entry === undefined) {
    throw runError({ code: RunErrorCode.RUN_NOT_FOUND, metadata: { runId } });
  }
  if (
    entry.state.phase === RunPhase.running ||
    entry.state.phase === RunPhase.preparing ||
    (entry.state.phase === RunPhase.prepared && entry.controller.signal.aborted)
  ) {
    throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
  }
  if (entry.state.phase !== RunPhase.prepared) {
    throw runError({
      code: RunErrorCode.INVALID_RUN_STATE,
      metadata: { runId },
    });
  }
  const strategy = entry.state.strategy;
  const seedAgent = initialInputAgent(strategy);
  entry.initialInput =
    seedAgent !== undefined && input.length !== 0
      ? { agentName: seedAgent, text: input }
      : null;
  const pending = Promise.withResolvers<RunOutcome>();
  entry.state = {
    phase: RunPhase.running,
    strategy,
    completion: pending.promise,
  };
  void executeRun(context, entry).then(pending.resolve, pending.reject);
  return { runId, completion: pending.promise };
  async function executeRun(
    context: RunsContext,
    entry: RunEntry,
  ): Promise<RunOutcome> {
    let outcome: RunOutcome;
    try {
      await publishRunState(context, entry);
      entry.controller.signal.throwIfAborted();
      if (input.length !== 0 && entry.retryInput !== input) {
        await saveUserMessage(context, runId, input);
      }
      entry.retryInput = undefined;
      entry.controller.signal.throwIfAborted();
      const flowCall = strategy.flow.call(input);
      const stop = (): void => flowCall.abort();
      entry.controller.signal.addEventListener("abort", stop, { once: true });
      if (entry.controller.signal.aborted) {
        stop();
      }
      let result;
      try {
        result = await flowCall;
      } finally {
        entry.controller.signal.removeEventListener("abort", stop);
      }
      await Promise.all(entry.children);
      entry.controller.signal.throwIfAborted();
      outcome = {
        status: RunOutcomeStatus.completed,
        result,
        summary: resultSummary(result),
      };
    } catch (cause) {
      const error =
        entry.failure ??
        (entry.controller.signal.aborted
          ? null
          : operationError(RunErrorCode.EXECUTION_ERROR, runId, cause));
      outcome =
        error === null
          ? { status: RunOutcomeStatus.stopped }
          : { status: RunOutcomeStatus.failed, error };
    }
    try {
      await interruptAgentMessages(
        context,
        entry,
        outcome.status === RunOutcomeStatus.stopped ? "stopped" : "failed",
      );
    } catch (cause) {
      outcome = {
        status: RunOutcomeStatus.failed,
        error:
          entry.failure ??
          operationError(RunErrorCode.PERSISTENCE_ERROR, runId, cause),
      };
    }
    await Promise.allSettled(entry.children);
    await cleanupRunEntry(entry);
    // Keep the completed response stable until both its copy boundary and final state are durable.
    context.operations.add(runId);
    entry.state = {
      phase: RunPhase.terminal,
      outcome:
        outcome.status === RunOutcomeStatus.completed
          ? { status: outcome.status, summary: outcome.summary }
          : outcome,
    };
    try {
      await persistRunWrite(entry, saveCopyCheckpoint(context, entry));
      await publishRunState(context, entry);
    } catch (cause) {
      outcome = {
        status: RunOutcomeStatus.failed,
        error:
          entry.failure ??
          operationError(RunErrorCode.PERSISTENCE_ERROR, runId, cause),
      };
      entry.state = { phase: RunPhase.terminal, outcome };
      context.notifications.notify(runId, {
        type: "run_snapshot",
        snapshot: {
          runId,
          parentRunId: entry.parentRunId,
          configuration: entry.configuration,
          ...(entry.strategyState
            ? { strategyState: entry.strategyState }
            : {}),
          strategy: entry.description,
          phase: RunPhase.terminal,
          outcome,
        },
      });
    } finally {
      context.operations.delete(runId);
    }
    return outcome;
  }
}
/**
 *  Stop active or prepared work, preserving an inspectable terminal record.
 * @param {RunsContext} context - Private runs state.
 * @param {string} runId - Stable conversation identity.
 * @returns {Promise<void>} Resolves after cancellation and cleanup.
 * @internal
 */
export async function stopRun(
  context: RunsContext,
  runId: string,
): Promise<void> {
  const staged = context.stagedStrategies.get(runId);
  if (staged) {
    staged.entry.controller.abort();
    await staged.completion;
  }
  let entry = context.runs.get(runId);
  if (entry === undefined) {
    const snapshot = await getRunSnapshot(context, runId);
    entry = context.runs.get(runId);
    if (entry === undefined) {
      if (snapshot === undefined) {
        throw runError({
          code: RunErrorCode.RUN_NOT_FOUND,
          metadata: { runId },
        });
      }
      return;
    }
  }
  const state = entry.state;
  if (state.phase === RunPhase.terminal) {
    return;
  }
  entry.controller.abort();
  if (state.phase === RunPhase.preparing) {
    await state.preparation.catch(() => undefined);
  } else if (state.phase === RunPhase.running) {
    await state.completion;
  } else {
    await cleanupRunEntry(entry);
    entry.state = {
      phase: RunPhase.terminal,
      outcome: { status: RunOutcomeStatus.stopped },
    };
    try {
      await publishRunState(context, entry);
    } catch (cause) {
      const error =
        entry.failure ??
        operationError(RunErrorCode.PERSISTENCE_ERROR, runId, cause);
      entry.state = {
        phase: RunPhase.terminal,
        outcome: { status: RunOutcomeStatus.failed, error },
      };
      context.notifications.notify(runId, {
        type: "run_snapshot",
        snapshot: {
          runId,
          parentRunId: entry.parentRunId,
          configuration: entry.configuration,
          ...(entry.strategyState
            ? { strategyState: entry.strategyState }
            : {}),
          strategy: entry.description,
          phase: RunPhase.terminal,
          outcome: entry.state.outcome,
        },
      });
      throw runError(error);
    }
  }
}
/**
 * Interrupt a selected invocation and persist steering before it resumes.
 * @param {RunsContext} context - Private runs state.
 * @param {string} runId - Stable conversation identity.
 * @param {string} text - User-supplied text.
 * @param {string} messageId - Active model invocation selected by the user.
 * @returns {Promise<void>} Resolves once the accepted message is durable.
 * @internal
 */
export async function steerRun(
  context: RunsContext,
  runId: string,
  text: string,
  messageId: string,
): Promise<void> {
  const entry = context.runs.get(runId);
  if (entry === undefined) {
    throw runError({ code: RunErrorCode.RUN_NOT_FOUND, metadata: { runId } });
  }
  if (entry.state.phase !== RunPhase.running) {
    throw runError({
      code: RunErrorCode.INVALID_RUN_STATE,
      metadata: { runId },
    });
  }
  const active = entry.activeMessages.get(messageId);
  const agent =
    active === undefined
      ? undefined
      : entry.state.strategy.agents[active.message.agentName];
  let writing: Promise<void> | undefined;
  if (
    !text.trim() ||
    agent?.steer?.(messageId, text, () => {
      if (active !== undefined) {
        active.message = {
          ...active.message,
          content: active.message.content.map((block) =>
            block.type === "tool" && block.status === "running"
              ? { ...block, cancellationRequestedBy: "user_steering" as const }
              : block,
          ),
        };
      }
      writing = saveUserMessage(context, runId, text);
      return writing;
    }) !== true
  ) {
    throw runError({ code: RunErrorCode.INVALID_ARGUMENTS });
  }
  await writing;
  context.notifications.notify(runId, {
    type: "run_steer_queued",
    runId,
    text,
  });
}
/**
 *  Await final cleanup and required writes before releasing feature-owned state.
 * @param {RunsContext} context - Private runs state.
 * @returns {Promise<void>} Resolves after all owned resources are released.
 * @internal
 */
export async function disposeRuns(context: RunsContext): Promise<void> {
  await Promise.allSettled(
    [
      ...new Set([...context.runs.keys(), ...context.stagedStrategies.keys()]),
    ].map((runId) => stopRun(context, runId)),
  );
  for (const entry of context.runs.values()) {
    while (entry.pendingWrites.size !== 0) {
      await Promise.allSettled([...entry.pendingWrites]);
    }
  }
  context.runs.clear();
  context.identities.clear();
}
