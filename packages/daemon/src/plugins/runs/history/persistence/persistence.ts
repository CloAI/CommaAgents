import type { RunsContext } from "../../state/state.types";
import type { RunSnapshot } from "../../runs.types";
import type { RunHistoryEntry } from "../../messages";

/**
 * Persist display state and track writes for a coherent subscription handoff.
 * @param {RunsContext} context - Private feature state.
 * @param {RunHistoryEntry | RunSnapshot} message - Display entry or lifecycle snapshot to persist.
 * @returns {Promise<void>} Durable snapshot completion.
 * @internal
 */
export async function persistRunSnapshot(
  context: RunsContext,
  message: RunHistoryEntry | RunSnapshot,
): Promise<void> {
  const writing =
    "messageId" in message
      ? context.history.save(message)
      : context.history.saveSnapshot(message);
  context.pendingWrites.add(writing);
  try {
    await writing;
    context.revision++;
  } catch (error) {
    const entry = context.runs.get(message.runId);
    if (entry && "messageId" in message) {
      entry.persistenceFailure = {
        code: "PERSISTENCE_ERROR",
        message: error instanceof Error ? error.message : String(error),
      };
      entry.controller.abort();
    }
    throw error;
  } finally {
    context.pendingWrites.delete(writing);
  }
}
