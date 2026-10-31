import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  ProviderArgumentsSchema,
  ProviderConfigurationSchema,
} from "@comma-agents/core";

/** Read credential availability and custom configuration without exposing secrets. */
export const getConfigurationCommand = defineCommand({
  name: "core.providers.getConfiguration",
  arguments: ProviderArgumentsSchema,
  output: ProviderConfigurationSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof ProviderArgumentsSchema>
  >) {
    return plugin.providers.getConfiguration(options);
  },
});
