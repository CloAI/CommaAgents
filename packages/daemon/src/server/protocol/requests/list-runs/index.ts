// List-runs request handler.
// Returns run summaries, optionally filtered by cwd.

import type { HandlerContext } from "../../dispatcher.types";
import type { ListRunsMessage } from "./list-runs.schema";

export { ListRunsMessage } from "./list-runs.schema";

/** Handle a `list_runs` request. */
export async function handleListRuns(
  message: ListRunsMessage,
  context: HandlerContext<"list_runs">,
): Promise<void> {
  const filter = message.cwd !== undefined ? { cwd: message.cwd } : undefined;
  const runs = await context.runSystem.runStore.listRuns(filter);
  context.reply({
    type: "run_list" as const,
    runs: [...runs],
    ts: new Date().toISOString(),
    ...(message.requestId !== undefined
      ? { requestId: message.requestId }
      : {}),
  });
}
