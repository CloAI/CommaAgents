import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  RefreshProvidersArgumentsSchema,
  RefreshProvidersOutputSchema,
} from "./refresh-providers.schemas";

/** Re-download models.dev and call every provider's API; the list channel receives the result. */
export const refreshProvidersCommand = defineCommand({
  name: "core.providers.refresh",
  arguments: RefreshProvidersArgumentsSchema,
  output: RefreshProvidersOutputSchema,
  async handle({
    plugin,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof RefreshProvidersArgumentsSchema>
  >) {
    await plugin.providers.refresh();
    return {};
  },
});
