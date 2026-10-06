import type { RunSnapshot } from "./run-store.types";

/**
 * Copy a run snapshot so callers cannot mutate authoritative state.
 *
 * @param {RunSnapshot} run - Snapshot to copy.
 * @returns {RunSnapshot} An independent copy of the snapshot.
 */
export function copyRunSnapshot(run: RunSnapshot): RunSnapshot {
  return { ...run };
}
