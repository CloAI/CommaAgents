import {
  parseStrategyFromString,
  readStrategyFile,
} from "@comma-agents/core/strategy";
import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  DescribeStrategyArgumentsSchema,
  DescribeStrategyOutputSchema,
} from "./describe-strategy.schemas";
import { describeStrategy } from "./describe-strategy.utils";

/** Read-only summary of a strategy file's agents, models, and steps. */
export const describeStrategyCommand = defineCommand({
  name: "core.strategies.describe",
  arguments: DescribeStrategyArgumentsSchema,
  output: DescribeStrategyOutputSchema,
  async handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof DescribeStrategyArgumentsSchema>
  >) {
    const file = await readStrategyFile(options.strategyPath);
    return describeStrategy(
      parseStrategyFromString(file.content, file.format),
      plugin.modelRoles,
    );
  },
});
