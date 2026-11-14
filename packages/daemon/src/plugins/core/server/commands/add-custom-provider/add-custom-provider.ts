import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  ProviderInfoSchema,
  AddCustomProviderArgumentsSchema,
} from "@comma-agents/core";

/** Persist a user-owned OpenAI-compatible endpoint. */
export const addCustomProviderCommand = defineCommand({
  name: "core.providers.addCustomProvider",
  arguments: AddCustomProviderArgumentsSchema,
  output: ProviderInfoSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof AddCustomProviderArgumentsSchema>
  >) {
    return plugin.providers.addCustomProvider(options);
  },
});
