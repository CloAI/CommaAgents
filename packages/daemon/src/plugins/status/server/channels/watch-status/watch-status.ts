import type { z } from "zod/v4";
import { defineChannel } from "../../../../../daemon-plugin";
import type {
  ChannelContext,
  CommandContext,
} from "../../../../../daemon-plugin";
import type { StatusContext, StatusPlugin } from "../../../status.types";
import {
  WatchStatusArgumentsSchema,
  WatchStatusMessageSchema,
} from "./watch-status.schemas";
export const watchStatusChannel = defineChannel({
  name: "status.watch",
  arguments: WatchStatusArgumentsSchema,
  message: WatchStatusMessageSchema,
  async open({
    plugin,
    channel,
  }: CommandContext<StatusPlugin, StatusContext, Record<string, never>> & {
    readonly channel: ChannelContext<z.input<typeof WatchStatusMessageSchema>>;
  }) {
    const cleanup = await plugin.notifications.subscribe(
      "status_updated",
      "daemon",
      ({ status }) => {
        channel.send({ type: "status.updated", data: status });
      },
    );
    return { cleanup };
  },
});
