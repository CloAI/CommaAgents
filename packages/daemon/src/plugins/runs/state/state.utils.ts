import type { RunEntry, RunSnapshot } from "./state.types";
import { RunPhase } from "./state.schemas";
/**
 *  Project serializable state without copying private execution resources.
 * @param {RunEntry} entry - Run that owns the operation.
 * @returns {RunSnapshot} Serializable projection of the current phase.
 * @internal
 */
export function runSnapshot(entry: RunEntry): RunSnapshot {
  const common = {
    runId: entry.runId,
    parentRunId: entry.parentRunId,
    configuration: entry.configuration,
    ...(entry.strategyState ? { strategyState: entry.strategyState } : {}),
  };
  const state = entry.state;
  if (state.phase === RunPhase.preparing) {
    return { ...common, phase: state.phase, strategy: entry.description };
  }
  if (state.phase === RunPhase.terminal) {
    return {
      ...common,
      phase: state.phase,
      strategy: entry.description,
      outcome: state.outcome,
    };
  }
  if (entry.description === null) {
    throw new Error("Loaded run has no strategy description");
  }
  if (state.phase === RunPhase.prepared) {
    return {
      ...common,
      phase: state.phase,
      strategy: entry.description,
      unmatchedAgents: state.unmatchedAgents,
    };
  }
  return { ...common, phase: state.phase, strategy: entry.description };
}
