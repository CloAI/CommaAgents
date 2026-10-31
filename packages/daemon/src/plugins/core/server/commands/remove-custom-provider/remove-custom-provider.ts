import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  ProviderArgumentsSchema,
  RemoveCustomProviderOutputSchema,
} from "@comma-agents/core";

/** Remove a persisted endpoint, its manual models, and its global key. */
export const removeCustomProviderCommand = defineCommand({
  name: "core.providers.removeCustomProvider",
  arguments: ProviderArgumentsSchema,
  output: RemoveCustomProviderOutputSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof ProviderArgumentsSchema>
  >) {
    return plugin.providers.removeCustomProvider(options);
  },
});
