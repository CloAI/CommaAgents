import { createProviderAuthentication } from "@comma-agents/core";
import { createPlugin } from "../../daemon-plugin";
import type { CreateCorePluginOptions } from "./core.types";
import { createCoreProviders } from "./providers";
import {
  beginSignInCommand,
  getSignInStatusCommand,
  cancelSignInCommand,
  listProvidersCommand,
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
 * const providers = await core.providers.list({ live: false });
 */
export function createCorePlugin({
  modelRoles = {},
}: CreateCorePluginOptions = {}) {
  const verification = new AbortController();
  const authentication = createProviderAuthentication();
  const plugin = createPlugin({
    name: "core",
    async cleanup() {
      verification.abort();
      authentication.dispose();
    },
    server: {
      commands: [
        listProvidersCommand,
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
  });
  return Object.assign(plugin, {
    providers: createCoreProviders(verification.signal, authentication),
    modelRoles,
  });
}
