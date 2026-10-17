import { bindPluginServer } from "./server/server.utils";
import { createPluginNotifications } from "./notifications";
import type { NotificationCollection } from "./notifications";
import type { CreatePluginOptions, Plugin } from "./plugin.types";
import type {
  CreateNotifyingPluginOptions,
  CreatedNotifyingPlugin,
} from "./notifications/notifications.types";

/**
 * Create a plugin opting into typed notifications with notifications: true.
 * @param {CreateNotifyingPluginOptions<PluginName, Collection>} options - Identity, cleanup, and notification behavior.
 * @returns {CreatedNotifyingPlugin<PluginName, Collection>} Public plugin and private controller.
 * @internal
 */
export function createPlugin<
  PluginName extends string,
  Collection extends NotificationCollection<Collection>,
  Owner = Plugin<PluginName>,
  Context = undefined,
>(
  options: CreateNotifyingPluginOptions<PluginName, Collection, Owner, Context>,
): CreatedNotifyingPlugin<PluginName, Collection>;
/**
 * Create a plain plugin with idempotent resource cleanup.
 * @param {CreatePluginOptions<PluginName>} options - Identity and cleanup.
 * @returns {Plugin<PluginName>} Named plugin.
 * @internal
 */
export function createPlugin<
  PluginName extends string,
  Owner = Plugin<PluginName>,
  Context = undefined,
>(options: CreatePluginOptions<PluginName, Owner, Context>): Plugin<PluginName>;
/**
 * Construct optional notifications and share the cleanup promise.
 * @param {CreatePluginOptions<PluginName> | CreateNotifyingPluginOptions<PluginName, Collection>} options - Plugin configuration.
 * @returns {Plugin<PluginName> | CreatedNotifyingPlugin<PluginName, Collection>} Plugin with optional controller.
 * @internal
 */
export function createPlugin<
  PluginName extends string,
  Collection extends NotificationCollection<Collection>,
  Owner = Plugin<PluginName>,
  Context = undefined,
>(
  options:
    | CreatePluginOptions<PluginName, Owner, Context>
    | CreateNotifyingPluginOptions<PluginName, Collection, Owner, Context>,
): Plugin<PluginName> | CreatedNotifyingPlugin<PluginName, Collection> {
  const notifications = options.notifications
    ? createPluginNotifications<Collection>(
        options.name,
        options.notificationHooks,
      )
    : undefined;
  let disposal: Promise<void> | undefined;
  const plugin: Plugin<PluginName> = {
    name: options.name,
    dispose(): Promise<void> {
      if (!disposal) {
        notifications?.beginDisposal();
        disposal = Promise.resolve()
          .then(options.cleanup)
          .finally(() => notifications?.close());
      }
      return disposal;
    },
  };
  if (options.server) {
    // Feature factories extend this same instance before any binding can be invoked.
    Object.assign(plugin, {
      server: bindPluginServer(
        options.server,
        plugin as unknown as Owner,
        options.context as Context,
      ),
    });
  }
  if (!notifications) {
    return plugin;
  }
  return {
    plugin: Object.assign(plugin, {
      notifications: { subscribe: notifications.subscribe },
    }),
    notifications,
  };
}
