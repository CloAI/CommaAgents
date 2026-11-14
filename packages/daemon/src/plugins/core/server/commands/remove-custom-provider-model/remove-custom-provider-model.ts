import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  ProviderInfoSchema,
  CustomProviderModelArgumentsSchema,
} from "@comma-agents/core";

/** Remove a manual entry without hiding catalog or discovered models. */
export const removeCustomProviderModelCommand = defineCommand({
  name: "core.providers.removeCustomProviderModel",
  arguments: CustomProviderModelArgumentsSchema,
  output: ProviderInfoSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof CustomProviderModelArgumentsSchema>
  >) {
    return plugin.providers.removeCustomProviderModel(options);
  },
});
