import { findLatestRunStart } from "../../../daemon-run-state/daemon-run-state.utils";
import type {
  PrepareRunOptions,
  PrepareRunResult,
  RunPreparationContext,
} from "../runs.types";
import type { RunEntry, RunsContext } from "../state/state.types";
import { updateRunSnapshot } from "../state";
import { loadRunForScope } from "../execution";
import {
  cleanupRunEntry,
  throwIfRunAborted,
} from "../execution/execution.utils";
import {
  conversationFromEvents,
  snapshotFromEvents,
} from "../history/history.utils";
import { preparationKey } from "./preparation.utils";
import { hydrateRunLineage, registerRunIdentity } from "../identity";
import { getRunHistory } from "../history";

async function prepareEntry(
  runsContext: RunsContext,
  entry: RunEntry,
  options: PrepareRunOptions,
): Promise<PrepareRunResult> {
  const runId = entry.snapshot.runId;
  try {
    const lineage = await hydrateRunLineage(runsContext, runId);
    const identity = lineage?.[0] ?? { runId };
    await registerRunIdentity(runsContext, identity);
    updateRunSnapshot(runsContext, entry, { ...entry.snapshot, ...identity });
    const events = await getRunHistory(runsContext, runId);
    const latestStart = findLatestRunStart(
      events.filter((event) => !event.runId || event.runId === runId),
    );
    const previous = snapshotFromEvents(runId, events);
    if (previous?.outcome?.status === "persistence_error") {
      throw new Error(`Run ${runId} has an unreliable persisted history`);
    }
    if (options.runId && !latestStart && !options.strategyPath) {
      throw new Error(`Run not found: ${runId}`);
    }
    const strategyPath = options.strategyPath ?? latestStart?.strategyPath;
    if (!strategyPath) {
      throw new Error("strategyPath is required for a new run");
    }
    const cwd = options.cwd ?? latestStart?.cwd ?? process.cwd();
    const mode = latestStart ? "continuation" : "new";
    const context: RunPreparationContext = {
      runId,
      ...(identity.parentRunId ? { parentRunId: identity.parentRunId } : {}),
      kind: identity.parentRunId ? "child" : "root",
      strategyPath,
      cwd,
      ...((options.manifestPath ?? latestStart?.manifestPath)
        ? { manifestPath: options.manifestPath ?? latestStart?.manifestPath }
        : {}),
      ...((options.modelOverride ?? latestStart?.modelOverride)
        ? {
            modelOverride: options.modelOverride ?? latestStart?.modelOverride,
          }
        : {}),
      signal: entry.controller.signal,
    };
    entry.settings = {
      ...(context.manifestPath ? { manifestPath: context.manifestPath } : {}),
      ...(context.modelOverride
        ? { modelOverride: context.modelOverride }
        : {}),
    };
    const conversation = conversationFromEvents(events, runId);
    updateRunSnapshot(runsContext, entry, {
      runId,
      ...(identity.parentRunId ? { parentRunId: identity.parentRunId } : {}),
      phase: "preparing",
      strategyPath,
      cwd,
      mode,
      conversation,
    });
    const prepared = await loadRunForScope(runsContext, entry, context);
    entry.disposers.push(...prepared.disposers);
    entry.lifecycle = { phase: "prepared", strategy: prepared.strategy };
    const unmatchedAgents = [
      ...new Set(conversation.records.map((record) => record.agentName)),
    ].filter((name) => !(name in prepared.strategy.agents));
    throwIfRunAborted(entry.controller.signal);
    updateRunSnapshot(runsContext, entry, {
      runId,
      ...(identity.parentRunId ? { parentRunId: identity.parentRunId } : {}),
      phase: "prepared",
      strategyPath,
      strategyName: prepared.strategy.name,
      cwd,
      mode,
      agents: Object.keys(prepared.strategy.agents),
      flowTree: prepared.strategy.raw.flow,
      conversation,
      unmatchedAgents,
    });
    return entry.snapshot;
  } catch (error) {
    await cleanupRunEntry(entry);
    runsContext.runs.delete(runId);
    if (entry.controller.signal.aborted) {
      runsContext.notifications.notify(runId, {
        type: "run_preparation_cancelled",
        runId,
      });
    } else {
      runsContext.notifications.notify(runId, {
        type: "run_preparation_failed",
        runId,
        error: {
          code: "PREPARATION_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    if (entry.previous) {
      runsContext.runs.set(runId, {
        ...entry,
        snapshot: entry.previous,
        lifecycle: { phase: "terminal" },
        preparation: undefined,
        execution: undefined,
      });
      runsContext.notifications.notify(runId, {
        type: "run_snapshot",
        snapshot: entry.previous,
      });
    }
    if (entry.controller.signal.aborted) {
      return { phase: "cancelled", runId };
    }
    throw error;
  }
}

/**
 * Prepare a new run or continuation, coalescing matching requests.
 * @param {RunsContext} runsContext - Private runs state and registrations.
 * @param {PrepareRunOptions} options - Run identity and strategy settings.
 * @returns {Promise<PrepareRunResult>} Prepared snapshot or cancellation result.
 * @internal
 */
export function prepareRun(
  runsContext: RunsContext,
  options: PrepareRunOptions,
): Promise<PrepareRunResult> {
  const runId = options.runId ?? crypto.randomUUID();
  const key = preparationKey({ ...options, runId });
  const existing = runsContext.runs.get(runId);
  if (existing?.snapshot.phase === "preparing") {
    if (existing.optionsKey !== key) {
      throw new Error(`Conflicting preparation for run ${runId}`);
    }
    return existing.preparation!;
  }
  if (
    existing?.snapshot.phase === "prepared" ||
    existing?.snapshot.phase === "running"
  ) {
    if (
      options.strategyPath ||
      options.cwd ||
      options.manifestPath ||
      options.modelOverride
    ) {
      if (existing.optionsKey !== key) {
        throw new Error(`Conflicting preparation for run ${runId}`);
      }
    }
    return Promise.resolve(existing.snapshot);
  }
  if (existing?.snapshot.outcome?.status === "persistence_error") {
    throw new Error(`Run ${runId} has an unreliable persisted history`);
  }
  const entry: RunEntry = {
    snapshot: {
      runId,
      phase: "preparing",
      strategyPath:
        options.strategyPath ?? existing?.snapshot.strategyPath ?? "",
      cwd: options.cwd ?? existing?.snapshot.cwd ?? process.cwd(),
      mode: existing ? "continuation" : "new",
    },
    lifecycle: { phase: "preparing" },
    controller: new AbortController(),
    optionsKey: key,
    ...(existing ? { previous: existing.snapshot } : {}),
    disposers: [],
    pendingInput: new Map(),
    steering: [],
    children: new Set(),
  };
  runsContext.runs.set(runId, entry);
  entry.preparation = prepareEntry(runsContext, entry, { ...options, runId });
  return entry.preparation;
}
