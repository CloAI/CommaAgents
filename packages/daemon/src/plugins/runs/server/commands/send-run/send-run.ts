import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import type { SendRunOptions } from "../../../switching";
import {
  SendRunArgumentsSchema,
  SendRunOutputSchema,
} from "../../../switching/switching.schemas";

export const sendRunCommand = defineCommand({
  name: "runs.send",
  arguments: SendRunArgumentsSchema,
  output: SendRunOutputSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<RunsPlugin, unknown, SendRunOptions>) {
    return plugin.sendRun(options);
  },
});
