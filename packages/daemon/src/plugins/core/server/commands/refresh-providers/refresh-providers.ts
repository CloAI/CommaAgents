import { ProviderInfoSchema } from "@comma-agents/core";
import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import { RefreshProvidersArgumentsSchema } from "./refresh-providers.schemas";

/** Refresh the catalog and fetch one provider's live models for immediate display. */
export const refreshProvidersCommand = defineCommand({
  name: "core.providers.refresh",
  arguments: RefreshProvidersArgumentsSchema,
  output: ProviderInfoSchema,
  async handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof RefreshProvidersArgumentsSchema>
  >) {
    return plugin.providers.refresh(options);
  },
});
