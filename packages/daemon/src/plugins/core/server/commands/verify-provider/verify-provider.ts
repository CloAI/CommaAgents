import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  VerifyProviderArgumentsSchema,
  ProviderVerificationSchema,
} from "@comma-agents/core";

/** Explicitly check access once without generating tokens. */
export const verifyCommand = defineCommand({
  name: "core.providers.verify",
  arguments: VerifyProviderArgumentsSchema,
  output: ProviderVerificationSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof VerifyProviderArgumentsSchema>
  >) {
    return plugin.providers.verify(options);
  },
});
