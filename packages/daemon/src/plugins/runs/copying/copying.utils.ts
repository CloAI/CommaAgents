import type { CopyCheckpoint, CopyManifest } from "./copying.schemas";

/** Remap owned execution references while preserving user text and opaque tool payloads.
 * @param {CopyCheckpoint["runs"][number]} run - Frozen source conversation.
 * @param {CopyManifest} manifest - Destination identity mapping and working directory.
 * @returns {CopyCheckpoint["runs"][number]} Conversation ready to persist independently.
 */
export function remapCopiedRun(
  run: CopyCheckpoint["runs"][number],
  { identities, cwd }: CopyManifest,
): CopyCheckpoint["runs"][number] {
  const mappedId = (runId: string): string => {
    const target = Object.hasOwn(identities, runId)
      ? identities[runId]
      : undefined;
    if (!target) {
      throw new Error(
        `Copy contains a run reference outside its tree: ${runId}`,
      );
    }
    return target;
  };
  const snapshot = {
    ...run.snapshot,
    runId: mappedId(run.snapshot.runId),
    ...(run.snapshot.parentRunId
      ? { parentRunId: mappedId(run.snapshot.parentRunId) }
      : {}),
    configuration: { ...run.snapshot.configuration, cwd },
    ...(run.snapshot.strategyState
      ? {
          strategyState: {
            ...run.snapshot.strategyState,
            changes: run.snapshot.strategyState.changes.map((change) => ({
              ...change,
              runId: mappedId(change.runId),
            })),
          },
        }
      : {}),
  };
  return {
    snapshot,
    conversation: run.conversation,
    history: run.history.map((entry) => ({
      ...entry,
      runId: mappedId(entry.runId),
      ...("parentRunId" in entry && entry.parentRunId
        ? { parentRunId: mappedId(entry.parentRunId) }
        : {}),
      ...(entry.type === "child.run"
        ? {
            childRunId: mappedId(entry.childRunId),
            messageId: mappedId(entry.childRunId),
          }
        : {}),
    })),
  };
}
