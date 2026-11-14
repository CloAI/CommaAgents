import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import type { SwitchStrategyOptions } from "../../../switching";
import { SwitchStrategyArgumentsSchema } from "../../../switching/switching.schemas";
import { RunPreparedSnapshotSchema } from "../../../state/state.schemas";

export const switchStrategyCommand = defineCommand({
  name: "runs.switchStrategy",
  arguments: SwitchStrategyArgumentsSchema,
  output: RunPreparedSnapshotSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<RunsPlugin, unknown, SwitchStrategyOptions>) {
    return plugin.switchStrategy(options);
  },
});
