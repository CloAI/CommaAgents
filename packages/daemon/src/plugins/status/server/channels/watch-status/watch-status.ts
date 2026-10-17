import { defineChannel } from "../../../../../daemon-plugin";
import type { ChannelContext, CommandContext } from "../../../../../daemon-plugin";
import type {
  StatusContext,
  StatusNotifications,
  StatusPlugin,
} from "../../../status.types";
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
    readonly channel: ChannelContext<StatusNotifications["status_updated"]>;
  }) {
    const cleanup = await plugin.notifications.subscribe(
      "status_updated",
      "daemon",
      channel.send,
    );
    return { cleanup };
  },
});
