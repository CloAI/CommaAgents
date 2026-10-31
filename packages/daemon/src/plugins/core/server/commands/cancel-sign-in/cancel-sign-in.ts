import type { z } from "zod/v4";
import {
  ProviderSignInAttemptArgumentsSchema,
  ProviderSignInStatusSchema,
} from "@comma-agents/core";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";

/** Delegate subscription sign-in to core; no credentials cross the wire. */
export const cancelSignInCommand = defineCommand({
  name: "core.providers.cancelSignIn",
  arguments: ProviderSignInAttemptArgumentsSchema,
  output: ProviderSignInStatusSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof ProviderSignInAttemptArgumentsSchema>
  >) {
    return plugin.providers.cancelSignIn(options);
  },
});
