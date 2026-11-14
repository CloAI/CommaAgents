import type { RunFeedState } from "../useRunChannel";

/**
 * Decide whether the run has an agent working that can be stopped.
 * @param {RunFeedState} feed - Channel state.
 * @returns {boolean} Whether Stop applies.
 */
export function hasActiveWork({
  initialized,
  snapshot,
  activeAgents,
}: RunFeedState): boolean {
  return (
    initialized && snapshot?.phase === "running" && activeAgents.length > 0
  );
}
