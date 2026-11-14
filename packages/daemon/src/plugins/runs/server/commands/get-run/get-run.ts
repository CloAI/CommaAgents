import { RunErrorCode, runError } from "../../../errors";
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
    if (snapshot === undefined) {
      throw runError({ code: RunErrorCode.RUN_NOT_FOUND, metadata: { runId } });
    }
    return snapshot;
  },
});
