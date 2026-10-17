import type { RunIdentity } from "../../../daemon-run-state/run-repository/run-repository.types";
import type { RunsContext } from "../state/state.types";

/**
 * Follow immediate parents from this execution to its root.
 * @param {RunsContext} context - Private identity registry.
 * @param {string} runId - Execution to resolve.
 * @returns {readonly RunIdentity[]} Execution followed by its ancestors.
 * @internal
 */
export function getRunLineage(
  context: RunsContext,
  runId: string,
): readonly RunIdentity[] {
  const lineage: RunIdentity[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = runId;
  while (currentId) {
    if (visited.has(currentId))
      throw new Error(`Cyclic run ancestry: ${currentId}`);
    visited.add(currentId);
    const identity = context.identities.get(currentId);
    if (!identity) throw new Error(`Missing run identity: ${currentId}`);
    lineage.push(identity);
    currentId = identity.parentRunId;
  }
  return lineage;
}

/**
 * Validate and durably register identity before acquiring execution resources.
 * @param {RunsContext} context - Private identity registry and storage.
 * @param {RunIdentity} identity - Execution and its immediate parent.
 * @returns {Promise<void>} Resolves after identity persistence.
 * @internal
 */
export async function registerRunIdentity(
  context: RunsContext,
  identity: RunIdentity,
): Promise<void> {
  const existing = context.identities.get(identity.runId);
  if (existing && existing.parentRunId !== identity.parentRunId)
    throw new Error(`Run parent cannot change: ${identity.runId}`);
  context.identities.set(identity.runId, identity);
  try {
    getRunLineage(context, identity.runId);
    await context.repository.saveRunIdentity(identity);
  } catch (error) {
    if (existing) context.identities.set(identity.runId, existing);
    else context.identities.delete(identity.runId);
    throw error;
  }
}

/**
 * Load persisted ancestry without reconstructing active execution resources.
 * @param {RunsContext} context - Private identity registry and storage.
 * @param {string} runId - Execution to hydrate.
 * @returns {Promise<readonly RunIdentity[] | undefined>} Ancestry, or undefined for an unknown execution.
 * @internal
 */
export async function hydrateRunLineage(
  context: RunsContext,
  runId: string,
): Promise<readonly RunIdentity[] | undefined> {
  let currentId: string | undefined = runId;
  const visited = new Set<string>();
  while (currentId) {
    if (visited.has(currentId))
      throw new Error(`Cyclic run ancestry: ${currentId}`);
    visited.add(currentId);
    let identity: RunIdentity | undefined =
      context.identities.get(currentId) ??
      (await context.repository.getRunIdentity(currentId));
    if (!identity) {
      const events = await context.repository.getEvents(currentId, {
        strict: true,
      });
      const started = events.find(
        (event) =>
          event.type === "run_started" &&
          (!event.runId || event.runId === currentId),
      );
      if (!started) {
        if (currentId === runId) return undefined;
        throw new Error(`Missing parent run: ${currentId}`);
      }
      identity = {
        runId: currentId,
        ...(started.parentRunId ? { parentRunId: started.parentRunId } : {}),
      };
    }
    context.identities.set(currentId, identity);
    currentId = identity.parentRunId;
  }
  return getRunLineage(context, runId);
}
