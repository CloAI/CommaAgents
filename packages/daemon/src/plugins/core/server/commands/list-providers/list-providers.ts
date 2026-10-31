import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  ListProvidersArgumentsSchema,
  ListProvidersOutputSchema,
} from "./list-providers.schemas";

/** Read-only provider and model discovery with optional live lookups. */
export const listProvidersCommand = defineCommand({
  name: "core.providers.list",
  arguments: ListProvidersArgumentsSchema,
  output: ListProvidersOutputSchema,
  async handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof ListProvidersArgumentsSchema>
  >) {
    return { providers: await plugin.providers.list(options) };
  },
});
