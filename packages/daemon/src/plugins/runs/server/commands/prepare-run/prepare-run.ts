import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin, PrepareRunOptions } from "../../../runs.types";
import {
  PrepareRunArgumentsSchema,
  PrepareRunOutputSchema,
} from "./prepare-run.schemas";
export const prepareRunCommand = defineCommand({
  name: "runs.prepare",
  arguments: PrepareRunArgumentsSchema,
  output: PrepareRunOutputSchema,
  async handle({
    plugin,
    arguments: options,
  }: CommandContext<RunsPlugin, unknown, PrepareRunOptions>) {
    const prepared = await plugin.prepareRun(options);
    return { runId: prepared.runId };
  },
});
