import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import type { RunsContext } from "../../../state/state.types";
import {
  StopRunArgumentsSchema,
  StopRunOutputSchema,
} from "./stop-run.schemas";
export const stopRunCommand = defineCommand({
  name: "runs.stop",
  arguments: StopRunArgumentsSchema,
  output: StopRunOutputSchema,
  async handle({
    plugin,
    context,
    arguments: { runId },
  }: CommandContext<RunsPlugin, RunsContext, { runId: string }>) {
    if (!(await plugin.getRun(runId))) {
      throw Object.assign(new Error(`Run not found: ${runId}`), {
        code: "RUN_NOT_FOUND",
      });
    }
    void plugin.stopRun(runId).catch((error: unknown) => {
      context.notifications.notify(runId, {
        type: "run_preparation_failed",
        runId,
        error: {
          code: "STOP_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    });
    return null;
  },
});
