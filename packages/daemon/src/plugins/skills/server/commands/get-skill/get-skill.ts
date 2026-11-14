import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { SkillsPlugin } from "../../../skills.types";
import {
  SkillsGetArgumentsSchema,
  SkillsGetOutputSchema,
} from "../../server.schemas";

/** Expose core-backed skills through the existing daemon command contract. */
export const getSkillsCommand = defineCommand({
  name: "skills.get",
  arguments: SkillsGetArgumentsSchema,
  output: SkillsGetOutputSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    SkillsPlugin,
    undefined,
    z.output<typeof SkillsGetArgumentsSchema>
  >) {
    return plugin.get(options);
  },
});
