import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  ProviderInfoSchema,
  AddCustomProviderModelArgumentsSchema,
} from "@comma-agents/core";

/** Add one user-provided model ID without provider requests. */
export const addCustomProviderModelCommand = defineCommand({
  name: "core.providers.addCustomProviderModel",
  arguments: AddCustomProviderModelArgumentsSchema,
  output: ProviderInfoSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof AddCustomProviderModelArgumentsSchema>
  >) {
    return plugin.providers.addCustomProviderModel(options);
  },
});
