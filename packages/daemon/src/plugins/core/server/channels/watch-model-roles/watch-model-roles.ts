import type { z } from "zod/v4";
import { defineChannel } from "../../../../../daemon-plugin";
import type {
  ChannelContext,
  CommandContext,
} from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import { describeModelRoles } from "../../commands/model-roles/model-roles";
import {
  WatchModelRolesArgumentsSchema,
  WatchModelRolesMessageSchema,
} from "./watch-model-roles.schemas";

/** The configured model roles, pushed again whenever any client changes them. */
export const watchModelRolesChannel = defineChannel({
  name: "core.modelRoles.watch",
  arguments: WatchModelRolesArgumentsSchema,
  message: WatchModelRolesMessageSchema,
  async open({
    plugin,
    channel,
  }: CommandContext<CorePlugin, undefined, Record<string, never>> & {
    readonly channel: ChannelContext<
      z.input<typeof WatchModelRolesMessageSchema>
    >;
  }) {
    const cleanup = await plugin.notifications.subscribe(
      "model_roles_updated",
      "model_roles",
      () => {
        channel.send({
          type: "modelRoles.updated",
          data: describeModelRoles(plugin),
        });
      },
    );
    return { cleanup };
  },
});
