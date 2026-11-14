import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import type { RunsContext } from "../../../state/state.types";
import {
  ListActiveRunsArgumentsSchema,
  ListActiveRunsOutputSchema,
} from "./list-active-runs.schemas";
export const listActiveRunsCommand = defineCommand({
  name: "runs.listActive",
  arguments: ListActiveRunsArgumentsSchema,
  output: ListActiveRunsOutputSchema,
  handle({
    plugin,
  }: CommandContext<RunsPlugin, RunsContext, Record<string, never>>) {
    return { runs: [...plugin.listActiveRuns()] };
  },
});
