import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { SkillsPlugin } from "../../../skills.types";
import {
  SkillsSearchArgumentsSchema,
  SkillsSearchOutputSchema,
} from "../../server.schemas";

/** Expose core-backed skills through the existing daemon command contract. */
export const searchSkillsCommand = defineCommand({
  name: "skills.search",
  arguments: SkillsSearchArgumentsSchema,
  output: SkillsSearchOutputSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    SkillsPlugin,
    undefined,
    z.output<typeof SkillsSearchArgumentsSchema>
  >) {
    return plugin.search(options);
  },
});
