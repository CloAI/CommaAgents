import { createRunRepository } from "../../../daemon-run-state/run-repository";
import type { CreateRunsPluginOptions, RunSnapshot } from "../runs.types";
import { allowedTransitions } from "./state.constants";
import type { RunEntry, RunsContext } from "./state.types";
import type { PluginNotifications } from "../../../daemon-plugin";
import type { RunNotifications } from "../runs.notifications";

/**
 * Construct the state and resources owned by a runs plugin.
 * @param {CreateRunsPluginOptions} options - Storage directory and feature dependencies.
 * @param {PluginNotifications<RunNotifications>} notifications - Private publishing controller.
 * @returns {RunsContext} Private runs state.
 * @internal
 */
export function createRunsContext(
  { runsDir, hubManager }: CreateRunsPluginOptions,
  notifications: PluginNotifications<RunNotifications>,
): RunsContext {
  if (!runsDir) throw new Error("runsDir is required");
  return {
    identities: new Map(),
    runs: new Map(),
    notifications,
    repository: createRunRepository({ runsDir }),
    ...(hubManager ? { hubManager } : {}),
    preparations: [],
    hooks: [],
  };
}

/**
 * Commit a valid snapshot transition and notify its run's listeners.
 * @param {RunsContext} context - Private runs state.
 * @param {RunEntry} entry - Run whose snapshot changes.
 * @param {RunSnapshot} snapshot - Next snapshot.
 * @returns {void} Nothing; commits and delivers the snapshot.
 * @internal
 */
export function updateRunSnapshot(
  context: RunsContext,
  entry: RunEntry,
  snapshot: RunSnapshot,
): void {
  if (!allowedTransitions[entry.snapshot.phase].includes(snapshot.phase)) {
    throw new Error(
      `Invalid run transition: ${entry.snapshot.phase} -> ${snapshot.phase}`,
    );
  }
  if (entry.lifecycle.phase !== snapshot.phase) {
    throw new Error(
      `Run state mismatch: ${entry.lifecycle.phase} vs ${snapshot.phase}`,
    );
  }
  entry.snapshot = snapshot;
  context.notifications.notify(snapshot.runId, {
    type: "run_snapshot",
    snapshot,
  });
}
