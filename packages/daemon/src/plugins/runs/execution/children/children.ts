import type { LaunchStrategyHandle } from "@comma-agents/core";
import type {
  RunEntry,
  RunSnapshot,
  RunsContext,
} from "../../state/state.types";
import { RunPhase, RunOutcomeStatus } from "../../state/state.schemas";
import { prepareRun } from "../../preparation";
import { beginRunExecution, stopRun } from "../execution";
import { persistRunWrite } from "../../history/persistence";
import { runError } from "../../errors";
import { getRunLineage } from "../../identity/identity";
/**
 *  Update a parent-owned reference explicitly after a child transition is durable.
 * @param {RunsContext} context - Private runs state.
 * @param {RunSnapshot} snapshot - Serializable lifecycle state.
 * @returns {Promise<void>} Resolves after the parent reference is updated.
 * @internal
 */
export async function updateChildReference(
  context: RunsContext,
  snapshot: RunSnapshot,
): Promise<void> {
  if (snapshot.parentRunId === undefined) {
    return;
  }
  const marker = await context.history.entry(
    snapshot.parentRunId,
    snapshot.runId,
  );
  if (marker === undefined || marker.type !== "child.run") {
    return;
  }
  const common = {
    type: "child.run" as const,
    messageId: marker.messageId,
    runId: marker.runId,
    childRunId: marker.childRunId,
    createdAt: marker.createdAt,
    sourceMessageId: marker.sourceMessageId,
    toolCallId: marker.toolCallId,
    strategyName: snapshot.strategy?.name ?? marker.strategyName,
  };
  const updated =
    snapshot.phase === RunPhase.terminal
      ? { ...common, phase: snapshot.phase, outcome: snapshot.outcome.status }
      : { ...common, phase: snapshot.phase };
  const parent = context.runs.get(snapshot.parentRunId);
  const writing = context.history.save(updated);
  if (parent !== undefined) {
    await persistRunWrite(parent, writing);
  } else {
    await writing;
  }
  context.notifications.notify(snapshot.parentRunId, {
    type: "run_child",
    runId: snapshot.parentRunId,
    entry: updated,
  });
}
/**
 *  Prepare and execute a child with independent storage and linked cancellation.
 * @param {RunsContext} context - Private runs state.
 * @param {RunEntry} parent - Parent execution.
 * @param {Parameters<LaunchStrategyHandle>[0]} request - Child launch request.
 * @returns {ReturnType<LaunchStrategyHandle>} Final child output.
 * @internal
 */
export async function executeChildRun(
  context: RunsContext,
  parent: RunEntry,
  request: Parameters<LaunchStrategyHandle>[0],
): ReturnType<LaunchStrategyHandle> {
  parent.controller.signal.throwIfAborted();
  // The lineage includes the parent itself, so its length is the depth the child would run at.
  const depth = getRunLineage(context, parent.runId).length;
  if (request.maxDepth !== undefined && depth > request.maxDepth) {
    throw new Error(
      `Subagent depth limit reached: this run is already ${depth - 1} levels below the root (limit ${request.maxDepth}). Do the work directly instead of delegating.`,
    );
  }
  const runId = crypto.randomUUID();
  const marker = {
    type: "child.run" as const,
    messageId: runId,
    runId: parent.runId,
    childRunId: runId,
    strategyName: request.strategyPath,
    createdAt: new Date().toISOString(),
    sourceMessageId: request.messageId,
    toolCallId: request.toolCallId,
    phase: RunPhase.preparing as const,
  };
  await persistRunWrite(parent, context.history.save(marker));
  context.notifications.notify(parent.runId, {
    type: "run_child",
    runId: parent.runId,
    entry: marker,
  });
  const stop = (): void => {
    void stopRun(context, runId).catch(() => undefined);
  };
  parent.controller.signal.addEventListener("abort", stop, { once: true });
  const child = (async () => {
    const preparing = prepareRun(
      context,
      {
        configuration: {
          strategyPath: request.strategyPath,
          cwd: parent.configuration.cwd,
          manifestPath: request.manifestPath,
          // Children inherit a run-wide override so every agent in an evaluated run uses one model.
          modelOverride:
            request.modelOverride ?? parent.configuration.modelOverride,
        },
      },
      { runId, parentRunId: parent.runId },
    );
    if (parent.controller.signal.aborted) {
      stop();
    }
    const prepared = await preparing;
    if (
      prepared.phase !== RunPhase.prepared ||
      parent.controller.signal.aborted
    ) {
      throw new DOMException("Child stopped", "AbortError");
    }
    const outcome = await beginRunExecution(context, runId, request.input)
      .completion;
    if (outcome.status !== RunOutcomeStatus.completed) {
      if (outcome.status === RunOutcomeStatus.failed) {
        throw runError(outcome.error);
      }
      throw new DOMException("Child stopped", "AbortError");
    }
    return {
      strategyName: prepared.strategy.name,
      text: outcome.summary.text,
      finishReason: outcome.summary.finishReason,
    };
  })();
  parent.children.add(child);
  try {
    return await child;
  } finally {
    parent.children.delete(child);
    parent.controller.signal.removeEventListener("abort", stop);
  }
}
