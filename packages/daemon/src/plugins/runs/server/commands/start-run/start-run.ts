import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import {
  StartRunArgumentsSchema,
  StartRunOutputSchema,
} from "./start-run.schemas";
export const startRunCommand = defineCommand({
  name: "runs.start",
  arguments: StartRunArgumentsSchema,
  output: StartRunOutputSchema,
  handle({
    plugin,
    arguments: { runId, input },
  }: CommandContext<RunsPlugin, unknown, { runId: string; input: string }>) {
    plugin.startRun(runId, input);
    return null;
  },
});
