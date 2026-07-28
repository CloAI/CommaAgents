import type { MutableRunRecord, RunSnapshot } from "./daemon-store.types";

/** Create an immutable boundary snapshot from an authoritative run record. */
export function createRunSnapshot(run: MutableRunRecord): RunSnapshot {
  return {
    id: run.id,
    strategyPath: run.strategyPath,
    strategyName: run.strategyName,
    startedAt: run.startedAt,
    cwd: run.cwd,
    status: run.status,
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.result ? { result: run.result } : {}),
    ...(run.error ? { error: run.error } : {}),
  };
}
