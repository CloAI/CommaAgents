import { getLogger } from "@logtape/logtape";
import type { RunEntry } from "../../state/state.types";
const logger = getLogger(["comma", "daemon", "plugins", "runs"]);
/**
 *  Reject pending input and release acquired resources once in reverse order.
 * @param {RunEntry} entry - Run that owns the operation.
 * @returns {Promise<void>} Resolves after resources are released.
 * @internal
 */
export function cleanupRunEntry(entry: RunEntry): Promise<void> {
  entry.cleanup ??= (async () => {
    for (const pending of entry.pendingInput.values()) {
      pending.cleanup();
      pending.reject(new DOMException("Run stopped", "AbortError"));
    }
    entry.pendingInput.clear();
    for (const dispose of entry.disposers.splice(0).reverse()) {
      try {
        await dispose();
      } catch (cause) {
        logger.warning(`Run ${entry.runId} resource cleanup failed`, { cause });
      }
    }
  })();
  return entry.cleanup;
}
