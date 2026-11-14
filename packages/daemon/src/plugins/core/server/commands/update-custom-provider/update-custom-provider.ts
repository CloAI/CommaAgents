import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  ProviderInfoSchema,
  UpdateCustomProviderArgumentsSchema,
} from "@comma-agents/core";

/** Update a user-owned endpoint without changing its identity. */
export const updateCustomProviderCommand = defineCommand({
  name: "core.providers.updateCustomProvider",
  arguments: UpdateCustomProviderArgumentsSchema,
  output: ProviderInfoSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof UpdateCustomProviderArgumentsSchema>
  >) {
    return plugin.providers.updateCustomProvider(options);
  },
});
