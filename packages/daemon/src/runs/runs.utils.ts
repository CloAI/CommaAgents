import type { Logger } from "../logger/logger.types";
import type { RunStore } from "./runs.types";

/**
 * Mark any persisted run with status `"pending"` or `"running"` as
 * `"cancelled"` with an `INTERRUPTED` error by appending a `run_completed` event.
 *
 * Intended to be called once on daemon startup. The in-memory `RunState`
 * for every run is lost when the daemon process exits, so any run on
 * disk that still claims to be live is necessarily stale — its agents
 * are not running, no input bridge is listening, and the TUI would
 * otherwise see a misleading `running` status and try to subscribe to
 * events that will never fire.
 *
 * Returns the number of runs that were marked.
 */
export async function markStaleRunsAsInterrupted(
  runStore: RunStore,
  logger: Logger,
): Promise<number> {
  const overviews = await runStore.listRuns();
  let interruptedCount = 0;

  for (const overview of overviews) {
    if (overview.status !== "pending" && overview.status !== "running") {
      continue;
    }

    await runStore.appendEvent(overview.runId, {
      type: "run_completed",
      ts: new Date().toISOString(),
      status: "cancelled",
      error: {
        code: "INTERRUPTED",
        message:
          "Daemon was restarted while this run was in progress; live state was lost.",
      },
    });
    interruptedCount += 1;
  }

  if (interruptedCount > 0) {
    logger.info(
      `Marked ${interruptedCount} stale run${
        interruptedCount === 1 ? "" : "s"
      } as cancelled (interrupted by daemon restart).`,
    );
  }

  return interruptedCount;
}
