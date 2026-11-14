import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { SkillsPlugin } from "../../../skills.types";
import {
  SkillsListArgumentsSchema,
  SkillsListOutputSchema,
} from "../../server.schemas";

/** Expose core-backed skills through the existing daemon command contract. */
export const listSkillsCommand = defineCommand({
  name: "skills.list",
  arguments: SkillsListArgumentsSchema,
  output: SkillsListOutputSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    SkillsPlugin,
    undefined,
    z.output<typeof SkillsListArgumentsSchema>
  >) {
    return plugin.list(options);
  },
});
