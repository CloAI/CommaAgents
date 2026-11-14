import type { RunIdentity, RunsContext } from "../state/state.types";
import { RunErrorCode, runError } from "../errors";
/**
 *  Follow cached immediate parents while detecting invalid ancestry.
 * @param {RunsContext} context - Private runs state.
 * @param {string} runId - Stable conversation identity.
 * @returns {readonly RunIdentity[]} Selected run followed by its ancestors.
 * @internal
 */
export function getRunLineage(
  context: RunsContext,
  runId: string,
): readonly RunIdentity[] {
  const lineage: RunIdentity[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = runId;
  while (currentId !== undefined) {
    if (visited.has(currentId)) {
      throw new Error(`Cyclic run ancestry: ${currentId}`);
    }
    visited.add(currentId);
    const identity = context.identities.get(currentId);
    if (identity === undefined) {
      throw runError({
        code: RunErrorCode.RUN_NOT_FOUND,
        metadata: { runId: currentId },
      });
    }
    lineage.push(identity);
    currentId = identity.parentRunId;
  }
  return lineage;
}
/**
 *  Load parent identity metadata without creating runtime entries.
 * @param {RunsContext} context - Private runs state.
 * @param {RunIdentity} identity - Known identity of the selected run.
 * @returns {Promise<void>} Resolves after parent identities are available.
 * @internal
 */
export async function loadRunLineage(
  context: RunsContext,
  identity: RunIdentity,
): Promise<void> {
  context.identities.set(identity.runId, {
    runId: identity.runId,
    parentRunId: identity.parentRunId,
  });
  let currentId: string | undefined = identity.runId;
  const visited = new Set<string>();
  while (currentId !== undefined) {
    if (visited.has(currentId)) {
      throw new Error(`Cyclic run ancestry: ${currentId}`);
    }
    visited.add(currentId);
    let currentIdentity = context.identities.get(currentId);
    if (currentIdentity === undefined) {
      const snapshot = await context.storage.read(currentId);
      if (snapshot === undefined) {
        throw runError({
          code: RunErrorCode.RUN_NOT_FOUND,
          metadata: { runId: currentId },
        });
      }
      currentIdentity = {
        runId: snapshot.runId,
        parentRunId: snapshot.parentRunId,
      };
      context.identities.set(currentId, currentIdentity);
    }
    currentId = currentIdentity.parentRunId;
  }
}
