import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import type { RunsContext } from "../../../state/state.types";
import { runError, RunErrorCode, operationError } from "../../../errors";
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
    if ((await plugin.getRun(runId)) === undefined) {
      throw runError({ code: RunErrorCode.RUN_NOT_FOUND, metadata: { runId } });
    }
    void plugin.stopRun(runId).catch((cause: unknown) => {
      context.notifications.notify(runId, {
        type: "run_error",
        runId,
        error: operationError(RunErrorCode.EXECUTION_ERROR, runId, cause),
      });
    });
    return null;
  },
});
