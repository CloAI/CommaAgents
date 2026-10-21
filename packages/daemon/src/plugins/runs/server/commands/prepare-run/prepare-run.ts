import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin, PrepareRunOptions } from "../../../runs.types";
import type { RunsContext } from "../../../state/state.types";
import { acceptRunCommand } from "../control";
import {
  PrepareRunArgumentsSchema,
  PrepareRunOutputSchema,
} from "./prepare-run.schemas";
export const prepareRunCommand = defineCommand({
  name: "runs.prepare",
  arguments: PrepareRunArgumentsSchema,
  output: PrepareRunOutputSchema,
  handle({
    plugin,
    context,
    arguments: options,
  }: CommandContext<RunsPlugin, RunsContext, PrepareRunOptions>) {
    const runId = options.runId ?? crypto.randomUUID();
    return acceptRunCommand(context, runId, async () => {
      if (context.runs.get(runId)?.lifecycle.phase === "running") {
        throw Object.assign(new Error("Run is already running"), {
          code: "RUN_ALREADY_RUNNING",
        });
      }
      const prepared = await plugin.prepareRun({ ...options, runId });
      if (prepared.phase !== "prepared") {
        throw Object.assign(new Error("Run preparation was cancelled"), {
          code: "PREPARATION_CANCELLED",
        });
      }
      return { runId };
    });
  },
});
