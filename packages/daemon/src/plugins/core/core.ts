import { createProviderAuthentication } from "@comma-agents/core";
import { createPlugin } from "../../daemon-plugin";
import type { CreateNotifyingPluginOptions } from "../../daemon-plugin/notifications/notifications.types";
import type {
  CoreNotifications,
  CorePlugin,
  CreateCorePluginOptions,
} from "./core.types";
import { createCoreProviders } from "./providers";
import { createProviderCatalog } from "./providers/catalog";
import {
  listProvidersChannel,
  beginSignInCommand,
  getSignInStatusCommand,
  cancelSignInCommand,
  listStrategiesCommand,
  describeStrategyCommand,
  refreshProvidersCommand,
  getConfigurationCommand,
  configureCommand,
  verifyCommand,
  removeCredentialCommand,
  addCustomProviderCommand,
  updateCustomProviderCommand,
  removeCustomProviderCommand,
  addCustomProviderModelCommand,
  removeCustomProviderModelCommand,
} from "./server";

/**
 * Aggregate reusable core provider APIs behind inferred daemon server bindings.
 * @param {CreateCorePluginOptions} [options] - Configured model roles used when describing strategies.
 * @returns {CorePlugin} Core methods and typed command definitions.
 * @example
 * const core = createCorePlugin();
 * await core.providers.load();
 */
export function createCorePlugin({
  modelRoles = {},
}: CreateCorePluginOptions = {}) {
  const verification = new AbortController();
  const authentication = createProviderAuthentication();
  const catalog = createProviderCatalog((snapshot) =>
    notifications.notify("providers", { type: "providers_updated", snapshot }),
  );
  const { plugin, notifications } = createPlugin({
    name: "core",
    notifications: true,
    notificationHooks: {
      onSubscribe(_type, _key, deliver) {
        deliver({ type: "providers_updated", snapshot: catalog.snapshot() });
      },
    },
    async cleanup() {
      verification.abort();
      authentication.dispose();
    },
    server: {
      channels: [listProvidersChannel],
      commands: [
        listStrategiesCommand,
        describeStrategyCommand,
        refreshProvidersCommand,
        getConfigurationCommand,
        configureCommand,
        verifyCommand,
        removeCredentialCommand,
        addCustomProviderCommand,
        updateCustomProviderCommand,
        removeCustomProviderCommand,
        addCustomProviderModelCommand,
        removeCustomProviderModelCommand,
        beginSignInCommand,
        getSignInStatusCommand,
        cancelSignInCommand,
      ],
    },
  } satisfies CreateNotifyingPluginOptions<
    "core",
    CoreNotifications,
    CorePlugin
  >);
  return Object.assign(plugin, {
    providers: createCoreProviders(
      verification.signal,
      authentication,
      catalog,
    ),
    modelRoles,
  });
}
