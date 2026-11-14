import type { CreatePluginOptions, Plugin } from "../plugin.types";

/** Map of supported names to notifications with matching discriminators. */
export type NotificationCollection<Collection> = {
  readonly [NotificationType in keyof Collection]: {
    readonly type: NotificationType;
  };
};

/** Receiver whose asynchronous work does not delay notification delivery. */
export type NotificationListener<Notification> = (
  notification: Notification,
) => void | Promise<void>;

/** Public subscriptions for a plugin's declared notification collection. */
export interface PluginSubscriptions<
  Collection extends NotificationCollection<Collection>,
> {
  /** Subscribe to one type and key, resolving after registration and initial delivery. */
  subscribe<NotificationType extends keyof Collection & string>(
    type: NotificationType,
    key: string,
    listener: NotificationListener<Collection[NotificationType]>,
  ): Promise<() => void>;
}

/** Feature-owned hydration and replay performed around registration. */
export interface NotificationHooks<
  Collection extends NotificationCollection<Collection>,
> {
  /** Choose subscription keys for an originating key; defaults to that key alone. */
  readonly getRecipientKeys?: (key: string) => readonly string[];
  /** Prepare state before registering the listener. */
  readonly beforeSubscribe?: (
    type: keyof Collection & string,
    key: string,
  ) => void | Promise<void>;
  /** Deliver current state synchronously after registration. */
  readonly onSubscribe?: (
    type: keyof Collection & string,
    key: string,
    deliver: (notification: Collection[keyof Collection]) => void,
  ) => void;
}

/** @internal Publishing and lifecycle controls retained by feature implementations. */
export interface PluginNotifications<
  Collection extends NotificationCollection<Collection>,
> extends PluginSubscriptions<Collection> {
  /** Deliver to captured matching subscriptions for the originating key. */
  notify(key: string, notification: Collection[keyof Collection]): void;
  /** Reject new subscriptions while permitting final cleanup notifications. */
  beginDisposal(): void;
  /** Clear subscriptions after cleanup. */
  close(): void;
}

/** Configuration opting into a declared collection of notifications. */
export interface CreateNotifyingPluginOptions<
  PluginName extends string,
  Collection extends NotificationCollection<Collection>,
  Owner = Plugin<PluginName>,
  Context = undefined,
> extends Omit<
  CreatePluginOptions<PluginName, Owner, Context>,
  "notifications"
> {
  /** Enable typed subscriptions and private publishing. */
  readonly notifications: true;
  /** Feature-owned subscription hydration and replay. */
  readonly notificationHooks?: NotificationHooks<Collection>;
}

/** Feature plugin exposing only notification subscriptions. */
export interface NotifyingPlugin<
  PluginName extends string,
  Collection extends NotificationCollection<Collection>,
> extends Plugin<PluginName> {
  /** Subscribe to a declared event and key. */
  readonly notifications: PluginSubscriptions<Collection>;
}

/** @internal Public plugin and private controller returned by construction. */
export interface CreatedNotifyingPlugin<
  PluginName extends string,
  Collection extends NotificationCollection<Collection>,
> {
  readonly plugin: NotifyingPlugin<PluginName, Collection>;
  readonly notifications: PluginNotifications<Collection>;
}
