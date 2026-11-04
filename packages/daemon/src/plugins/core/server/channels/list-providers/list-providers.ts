import type { z } from "zod/v4";
import { defineChannel } from "../../../../../daemon-plugin";
import type {
  ChannelContext,
  CommandContext,
} from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  ListProvidersArgumentsSchema,
  ListProvidersMessageSchema,
} from "./list-providers.schemas";

/** Every provider and its models, pushed again after each change. */
export const listProvidersChannel = defineChannel({
  name: "core.providers.list",
  arguments: ListProvidersArgumentsSchema,
  message: ListProvidersMessageSchema,
  async open({
    plugin,
    channel,
  }: CommandContext<CorePlugin, undefined, Record<string, never>> & {
    readonly channel: ChannelContext<
      z.input<typeof ListProvidersMessageSchema>
    >;
  }) {
    await plugin.providers.ready();
    const cleanup = await plugin.notifications.subscribe(
      "providers_updated",
      "providers",
      ({ snapshot }) => {
        channel.send({ type: "providers.updated", data: snapshot });
      },
    );
    return { cleanup };
  },
});
