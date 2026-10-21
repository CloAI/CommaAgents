import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import type { RunsContext } from "../../../state/state.types";
import { acceptRunCommand } from "../control";
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
    context,
    arguments: { runId, input },
  }: CommandContext<
    RunsPlugin,
    RunsContext,
    z.output<typeof StartRunArgumentsSchema>
  >) {
    return acceptRunCommand(context, runId, () => {
      const phase = context.runs.get(runId)?.lifecycle.phase;
      if (phase === "running") {
        throw Object.assign(new Error("Run is already running"), {
          code: "RUN_ALREADY_RUNNING",
        });
      }
      if (phase !== "prepared") {
        throw Object.assign(new Error("Run must be prepared before starting"), {
          code: "RUN_NOT_PREPARED",
        });
      }
      plugin.startRun(runId, input);
      return null;
    });
  },
});
