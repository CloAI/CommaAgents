import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import type { RunsContext } from "../../../state/state.types";
import { GetRunArgumentsSchema, GetRunOutputSchema } from "./get-run.schemas";
export const getRunCommand = defineCommand({
  name: "runs.get",
  arguments: GetRunArgumentsSchema,
  output: GetRunOutputSchema,
  async handle({
    plugin,
    arguments: { runId },
  }: CommandContext<RunsPlugin, RunsContext, { runId: string }>) {
    const snapshot = await plugin.getRun(runId);
    if (!snapshot) {
      throw Object.assign(new Error(`Run not found: ${runId}`), {
        code: "RUN_NOT_FOUND",
      });
    }
    return snapshot;
  },
});
