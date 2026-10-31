import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import type { RunsContext } from "../../../state/state.types";
import {
  GetHistoryArgumentsSchema,
  GetHistoryOutputSchema,
} from "./get-history.schemas";
export const getHistoryCommand = defineCommand({
  name: "runs.history",
  arguments: GetHistoryArgumentsSchema,
  output: GetHistoryOutputSchema,
  async handle({
    plugin,
    arguments: { runId, ...options },
  }: CommandContext<
    RunsPlugin,
    RunsContext,
    z.output<typeof GetHistoryArgumentsSchema>
  >) {
    return plugin.getHistory(runId, options);
  },
});
