import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  ProviderArgumentsSchema,
  ProviderConfigurationSchema,
} from "@comma-agents/core";

/** Remove the saved global key while preserving core credential precedence. */
export const removeCredentialCommand = defineCommand({
  name: "core.providers.removeCredential",
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
    return plugin.providers.removeCredential(options);
  },
});
