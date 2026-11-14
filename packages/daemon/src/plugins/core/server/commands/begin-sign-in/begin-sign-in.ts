import type { z } from "zod/v4";
import {
  ProviderSignInArgumentsSchema,
  ProviderSignInStartSchema,
} from "@comma-agents/core";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";

/** Delegate subscription sign-in to core; no credentials cross the wire. */
export const beginSignInCommand = defineCommand({
  name: "core.providers.beginSignIn",
  arguments: ProviderSignInArgumentsSchema,
  output: ProviderSignInStartSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof ProviderSignInArgumentsSchema>
  >) {
    return plugin.providers.beginSignIn(options);
  },
});
