import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { SkillsPlugin } from "../../../skills.types";
import {
  SkillsListForRunArgumentsSchema,
  SkillsListForRunOutputSchema,
} from "../../server.schemas";

/** Expose core-backed skills through the existing daemon command contract. */
export const listForRunSkillsCommand = defineCommand({
  name: "skills.listForRun",
  arguments: SkillsListForRunArgumentsSchema,
  output: SkillsListForRunOutputSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    SkillsPlugin,
    undefined,
    z.output<typeof SkillsListForRunArgumentsSchema>
  >) {
    return plugin.listForRun(options);
  },
});
