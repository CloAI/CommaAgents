import { runError, RunErrorCode } from "../errors";
import { createRunHistoryStorage } from "../history/storage";
import { createRunStorage } from "./storage/storage";
import type { PluginNotifications } from "../../../daemon-plugin";
import type { CreateRunsPluginOptions } from "../runs.types";
import type { RunNotifications } from "../runs.notifications";
import type { RunConfiguration } from "../preparation/preparation.types";
import type {
  ActiveRun,
  RunEntry,
  RunIdentity,
  RunSnapshot,
  RunState,
  RunsContext,
} from "./state.types";
import { RunPhase, RunOutcomeStatus } from "./state.schemas";
import { runSnapshot } from "./state.utils";
import { persistRunWrite } from "../history/persistence";
import { loadRunLineage } from "../identity";
import { updateChildReference } from "../execution/children/children";
/**
 *  Construct private storage and resources without intercepting notification delivery.
 * @param {CreateRunsPluginOptions} options - Operation settings.
 * @param {PluginNotifications<RunNotifications>} notifications - Private notification publisher.
 * @returns {RunsContext} Private feature resources.
 * @internal
 */
export function createRunsContext(
  { runsDir, hubManager, harness }: CreateRunsPluginOptions,
  notifications: PluginNotifications<RunNotifications>,
): RunsContext {
  return {
    runsDir,
    runs: new Map(),
    operations: new Set(),
    stagedStrategies: new Map(),
    identities: new Map(),
    storage: createRunStorage(runsDir),
    history: createRunHistoryStorage(runsDir),
    notifications,
    hubManager,
    harness,
    preparations: [],
    hooks: [],
  };
}
/**
 *  Allocate the resources shared by all phases of one run.
 * @param {RunIdentity} identity - Run identity and parent linkage.
 * @param {RunConfiguration} configuration - Resolved loading settings.
 * @param {RunState} state - Authoritative lifecycle state.
 * @returns {RunEntry} Resources and state for one execution.
 * @internal
 */
export function createRunEntry(
  identity: RunIdentity,
  configuration: RunConfiguration,
  state: RunState,
): RunEntry {
  return {
    ...identity,
    configuration,
    state,
    description: null,
    controller: new AbortController(),
    activators: [],
    disposers: [],
    cleanup: null,
    pendingInput: new Map(),
    initialInput: null,
    pendingStrategySwitch: null,
    children: new Set(),
    activeMessages: new Map(),
    pendingWrites: new Set(),
    failure: null,
  };
}
/**
 *  Persist and publish a lifecycle transition explicitly, then update its parent reference.
 * @param {RunsContext} context - Private runs state.
 * @param {RunEntry} entry - Run that owns the operation.
 * @returns {Promise<void>} Resolves after durable publication and parent updates.
 * @internal
 */
export async function publishRunState(
  context: RunsContext,
  entry: RunEntry,
): Promise<void> {
  const snapshot = runSnapshot(entry);
  await persistRunWrite(entry, context.storage.save(snapshot));
  context.notifications.notify(entry.runId, { type: "run_snapshot", snapshot });
  await updateChildReference(context, snapshot);
}
/**
 * List runs that are executing now, including delegated child runs.
 * @param {RunsContext} context - Private runs state.
 * @returns {readonly ActiveRun[]} Running runs; prepared, preparing and finished runs are excluded.
 * @internal
 */
export function listActiveRuns(context: RunsContext): readonly ActiveRun[] {
  return [...context.runs.values()]
    .filter((entry) => entry.state.phase === RunPhase.running)
    .map(({ runId, parentRunId }) => ({ runId, parentRunId }));
}
/**
 * Read current runtime state or saved metadata without allocating execution resources or writing storage.
 * @param {RunsContext} context - Private runs state.
 * @param {string} runId - Stable conversation identity.
 * @returns {Promise<RunSnapshot | undefined>} Current snapshot, or an interrupted view of saved executable state.
 * @internal
 */
export async function getRunSnapshot(
  context: RunsContext,
  runId: string,
): Promise<RunSnapshot | undefined> {
  const current = context.runs.get(runId);
  if (current !== undefined) {
    return runSnapshot(current);
  }
  const saved = await context.storage.read(runId);
  if (saved !== undefined) {
    await loadRunLineage(context, saved);
  }
  // Preparation may have allocated a runtime while metadata was loading.
  const prepared = context.runs.get(runId);
  if (prepared !== undefined) {
    return runSnapshot(prepared);
  }
  if (saved === undefined || saved.phase === RunPhase.terminal) {
    return saved;
  }
  // A saved executable phase has no live owner in this daemon. Report it without rewriting the file.
  return {
    runId: saved.runId,
    parentRunId: saved.parentRunId,
    configuration: saved.configuration,
    ...(saved.strategyState ? { strategyState: saved.strategyState } : {}),
    strategy: saved.strategy,
    phase: RunPhase.terminal,
    outcome: { status: RunOutcomeStatus.interrupted },
  };
}

/** Persist a future MCP choice with the run, leaving active connection resources alone.
 * @param {RunsContext} context - Current run state and storage.
 * @param {string} runId - Existing conversation identity.
 * @param {string} serverId - Server whose override is changed.
 * @param {boolean | null} enabled - Explicit choice, or null to follow the default.
 * @returns {Promise<void>} Resolves after the run configuration is saved.
 * @internal
 */
export async function setMcpServerOverride(
  context: RunsContext,
  runId: string,
  serverId: string,
  enabled: boolean | null,
): Promise<void> {
  if (!serverId || (enabled !== null && typeof enabled !== "boolean")) {
    throw runError({ code: RunErrorCode.INVALID_ARGUMENTS });
  }
  if (context.operations.has(runId)) {
    throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
  }
  // Running metadata writes are tracked below; finalization owns its own reservation.
  let reserved = context.runs.get(runId)?.state.phase !== RunPhase.running;
  if (reserved) {
    context.operations.add(runId);
  }
  try {
    const saved = await getRunSnapshot(context, runId);
    if (!saved) {
      throw runError({ code: RunErrorCode.RUN_NOT_FOUND, metadata: { runId } });
    }
    if (!reserved && context.operations.has(runId)) {
      throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
    }
    const entry = context.runs.get(runId);
    if (!reserved && entry?.state.phase !== RunPhase.running) {
      context.operations.add(runId);
      reserved = true;
    }
    if (entry?.state.phase === RunPhase.preparing) {
      throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
    }
    const previous = entry?.configuration ?? saved.configuration;
    const overrides =
      enabled === null
        ? { ...previous.mcpServerOverrides }
        : { ...previous.mcpServerOverrides, [serverId]: enabled };
    if (enabled === null) {
      delete overrides[serverId];
    }
    const { mcpServerOverrides: _previousOverrides, ...configuration } =
      previous;
    const updated = {
      ...configuration,
      ...(Object.keys(overrides).length
        ? { mcpServerOverrides: overrides }
        : {}),
    };
    if (entry) {
      // Publish the new configuration synchronously so lifecycle writes queued
      // during persistence also retain this choice.
      entry.configuration = updated;
      const snapshot = runSnapshot(entry);
      try {
        await persistRunWrite(entry, context.storage.save(snapshot));
      } catch (error) {
        if (entry.configuration === updated) {
          entry.configuration = previous;
        }
        throw error;
      }
      // A lifecycle transition publishes its own newer snapshot; do not replay an older phase.
      if (entry.state.phase === snapshot.phase) {
        context.notifications.notify(runId, { type: "run_snapshot", snapshot });
      }
    } else {
      const snapshot = { ...saved, configuration: updated };
      await context.storage.save(snapshot);
      context.notifications.notify(runId, { type: "run_snapshot", snapshot });
    }
  } finally {
    if (reserved) {
      context.operations.delete(runId);
    }
  }
}
