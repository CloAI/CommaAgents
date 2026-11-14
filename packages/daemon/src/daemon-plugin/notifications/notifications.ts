import { getLogger } from "@logtape/logtape";
import type {
  NotificationCollection,
  NotificationHooks,
  PluginNotifications,
  PluginSubscriptions,
} from "./notifications.types";

/**
 * Manage typed subscriptions and isolate failures during synchronous delivery.
 * @param {string} name - Plugin identity for listener diagnostics.
 * @param {NotificationHooks<Collection>} hooks - Feature-specific hydration and replay.
 * @returns {PluginNotifications<Collection>} Private controller.
 * @internal
 */
export function createPluginNotifications<
  Collection extends NotificationCollection<Collection>,
>(
  name: string,
  hooks: NotificationHooks<Collection> = {},
): PluginNotifications<Collection> {
  const logger = getLogger(["comma", "daemon", "plugins", name]);
  type Notification = Collection[keyof Collection];
  const subscribers = new Map<
    string,
    Map<PropertyKey, Set<(notification: Notification) => void>>
  >();
  let phase: "active" | "disposing" | "closed" = "active";

  function reportFailure(
    key: string,
    type: keyof Collection,
    error: unknown,
  ): void {
    logger.warning(
      `Notification listener failed for ${name}/${key}/${String(type)}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const subscribe: PluginSubscriptions<Collection>["subscribe"] = async (
    type,
    key,
    listener,
  ) => {
    if (phase !== "active") {
      throw new Error(`${name} plugin is disposing or disposed`);
    }
    await hooks.beforeSubscribe?.(type, key);
    if (phase !== "active") {
      throw new Error(`${name} plugin is disposing or disposed`);
    }
    const groups =
      subscribers.get(key) ??
      new Map<PropertyKey, Set<(notification: Notification) => void>>();
    const group =
      groups.get(type) ?? new Set<(notification: Notification) => void>();
    const deliver = (notification: Notification): void => {
      if (notification.type !== type) {
        return;
      }
      try {
        // The discriminator check matches this union member to the selected collection key.
        const completion = listener(notification as Collection[typeof type]);
        if (completion) {
          void Promise.resolve(completion).catch((error: unknown) =>
            reportFailure(key, type, error),
          );
        }
      } catch (error) {
        reportFailure(key, type, error);
      }
    };
    group.add(deliver);
    groups.set(type, group);
    subscribers.set(key, groups);
    const unsubscribe = (): void => {
      group.delete(deliver);
      if (group.size === 0 && groups.get(type) === group) {
        groups.delete(type);
      }
      if (groups.size === 0 && subscribers.get(key) === groups) {
        subscribers.delete(key);
      }
    };
    try {
      hooks.onSubscribe?.(type, key, deliver);
    } catch (error) {
      unsubscribe();
      throw error;
    }
    return unsubscribe;
  };

  return {
    subscribe,
    notify(key, notification): void {
      if (phase === "closed") {
        return;
      }
      const keys = hooks.getRecipientKeys?.(key) ?? [key];
      const recipients = [...new Set(keys)].flatMap((key) => [
        ...(subscribers.get(key)?.get(notification.type) ?? []),
      ]);
      for (const recipient of recipients) {
        recipient(notification);
      }
    },
    beginDisposal(): void {
      if (phase === "active") {
        phase = "disposing";
      }
    },
    close(): void {
      phase = "closed";
      subscribers.clear();
    },
  };
}
