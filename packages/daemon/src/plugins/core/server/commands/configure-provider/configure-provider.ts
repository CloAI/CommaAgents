import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  ConfigureProviderArgumentsSchema,
  ProviderConfigurationSchema,
} from "@comma-agents/core";

/** Save a global API key through core without verifying it. */
export const configureCommand = defineCommand({
  name: "core.providers.configure",
  arguments: ConfigureProviderArgumentsSchema,
  output: ProviderConfigurationSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof ConfigureProviderArgumentsSchema>
  >) {
    return plugin.providers.configure(options);
  },
});
