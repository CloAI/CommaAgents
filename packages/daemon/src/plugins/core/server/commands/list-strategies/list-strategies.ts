import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  ListStrategiesArgumentsSchema,
  ListStrategiesOutputSchema,
} from "./list-strategies.schemas";

/** Read-only discovery of strategies available to new runs. */
export const listStrategiesCommand = defineCommand({
  name: "core.strategies.list",
  arguments: ListStrategiesArgumentsSchema,
  output: ListStrategiesOutputSchema,
  async handle({
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof ListStrategiesArgumentsSchema>
  >) {
    // Load only the strategy module, as the runs plugin does.
    const { discoverStrategies } = await import("@comma-agents/core/strategy");
    return discoverStrategies({ cwd: options.cwd });
  },
});
