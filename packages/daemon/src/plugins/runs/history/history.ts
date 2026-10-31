import type { RunsContext } from "../state/state.types";
import type { RunHistoryOptions, RunHistoryPage } from "./history.types";
import { getRunSnapshot } from "../state/state";
import { runError, RunErrorCode } from "../errors";
/**
 *  Read one run's finalized display history without replaying its model context.
 * @param {RunsContext} context - Private runs state.
 * @param {string} runId - Stable conversation identity.
 * @param {RunHistoryOptions} options - Operation settings.
 * @returns {Promise<RunHistoryPage>} Chronological finished entries and page cursor.
 * @internal
 */
export async function getDisplayHistory(
  context: RunsContext,
  runId: string,
  options?: RunHistoryOptions,
): Promise<RunHistoryPage> {
  if ((await getRunSnapshot(context, runId)) === undefined) {
    throw runError({ code: RunErrorCode.RUN_NOT_FOUND, metadata: { runId } });
  }
  return context.history.read(runId, options);
}
