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
  getModelRolesCommand,
  setModelRolesCommand,
  watchModelRolesChannel,
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
  persistModelRoles,
}: CreateCorePluginOptions = {}) {
  let currentModelRoles = modelRoles;
  const verification = new AbortController();
  const authentication = createProviderAuthentication();
  const catalog = createProviderCatalog((snapshot) =>
    notifications.notify("providers", { type: "providers_updated", snapshot }),
  );
  const { plugin, notifications } = createPlugin({
    name: "core",
    notifications: true,
    notificationHooks: {
      onSubscribe(type, _key, deliver) {
        deliver(
          type === "model_roles_updated"
            ? { type: "model_roles_updated" }
            : { type: "providers_updated", snapshot: catalog.snapshot() },
        );
      },
    },
    async cleanup() {
      verification.abort();
      authentication.dispose();
    },
    server: {
      channels: [listProvidersChannel, watchModelRolesChannel],
      commands: [
        listStrategiesCommand,
        describeStrategyCommand,
        getModelRolesCommand,
        setModelRolesCommand,
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
    getModelRoles: () => currentModelRoles,
    setModelRoles(next: Readonly<Record<string, string>>) {
      persistModelRoles?.(next);
      currentModelRoles = next;
      notifications.notify("model_roles", { type: "model_roles_updated" });
    },
  });
}
