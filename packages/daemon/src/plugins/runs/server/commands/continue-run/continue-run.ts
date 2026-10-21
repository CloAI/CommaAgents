import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import type { RunsContext } from "../../../state/state.types";
import { acceptRunCommand } from "../control";
import {
  ContinueRunArgumentsSchema,
  ContinueRunOutputSchema,
} from "./continue-run.schemas";
export const continueRunCommand = defineCommand({
  name: "runs.continue",
  arguments: ContinueRunArgumentsSchema,
  output: ContinueRunOutputSchema,
  handle({
    plugin,
    context,
    arguments: { runId, input },
  }: CommandContext<
    RunsPlugin,
    RunsContext,
    z.output<typeof ContinueRunArgumentsSchema>
  >) {
    return acceptRunCommand(context, runId, async () => {
      const snapshot = await plugin.getRun(runId);
      if (!snapshot) {
        throw Object.assign(new Error(`Run not found: ${runId}`), {
          code: "RUN_NOT_FOUND",
        });
      }
      if (snapshot.phase === "running" || snapshot.phase === "preparing") {
        throw Object.assign(new Error("Run is busy"), {
          code: "RUN_ALREADY_RUNNING",
        });
      }
      const prepared = await plugin.prepareRun({ runId });
      if (prepared.phase !== "prepared" || prepared.mode !== "continuation") {
        throw Object.assign(new Error("Run is not prepared for continuation"), {
          code: "RUN_NOT_PREPARED",
        });
      }
      plugin.continueRun(runId, input);
      return null;
    });
  },
});
