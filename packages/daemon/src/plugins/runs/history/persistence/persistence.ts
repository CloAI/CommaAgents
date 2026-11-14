import type { RunEntry } from "../../state/state.types";
import { operationError, runError, RunErrorCode } from "../../errors";
/**
 *  Track one run's required write and retain a typed failure if storage rejects it.
 * @param {RunEntry} entry - Run that owns the operation.
 * @param {Promise<Result>} writing - Required storage operation.
 * @returns {Promise<Result>} Result after the tracked operation completes.
 * @internal
 */
export async function persistRunWrite<Result>(
  entry: RunEntry,
  writing: Promise<Result>,
): Promise<Result> {
  entry.pendingWrites.add(writing);
  try {
    return await writing;
  } catch (cause) {
    entry.failure = operationError(
      RunErrorCode.PERSISTENCE_ERROR,
      entry.runId,
      cause,
    );
    entry.controller.abort();
    throw runError(entry.failure);
  } finally {
    entry.pendingWrites.delete(writing);
  }
}
