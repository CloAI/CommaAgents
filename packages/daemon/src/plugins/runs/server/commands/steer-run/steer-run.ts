import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import type { RunsContext } from "../../../state/state.types";
import {
  SteerRunArgumentsSchema,
  SteerRunOutputSchema,
} from "./steer-run.schemas";
export const steerRunCommand = defineCommand({
  name: "runs.steer",
  arguments: SteerRunArgumentsSchema,
  output: SteerRunOutputSchema,
  handle({
    plugin,
    arguments: { runId, text },
  }: CommandContext<
    RunsPlugin,
    RunsContext,
    z.output<typeof SteerRunArgumentsSchema>
  >) {
    if (!plugin.steerRun(runId, text)) {
      throw Object.assign(new Error("Run is not running"), {
        code: "RUN_NOT_RUNNING",
      });
    }
    return null;
  },
});
