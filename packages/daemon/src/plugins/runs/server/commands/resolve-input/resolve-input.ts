import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import type { RunsContext } from "../../../state/state.types";
import {
  ResolveInputArgumentsSchema,
  ResolveInputOutputSchema,
} from "./resolve-input.schemas";
export const resolveInputCommand = defineCommand({
  name: "runs.resolveInput",
  arguments: ResolveInputArgumentsSchema,
  output: ResolveInputOutputSchema,
  async handle({
    plugin,
    arguments: { runId, inputId, text },
  }: CommandContext<
    RunsPlugin,
    RunsContext,
    z.output<typeof ResolveInputArgumentsSchema>
  >) {
    if (!(await plugin.resolveInput(runId, inputId, text))) {
      throw Object.assign(new Error("Input request is no longer pending"), {
        code: "INPUT_NOT_FOUND",
      });
    }
    return null;
  },
});
