import {
  getProviderConfiguration,
  configureProvider,
  removeProviderCredential,
  verifyProvider,
  addCustomProvider,
  updateCustomProvider,
  removeCustomProvider,
  addCustomProviderModel,
  removeCustomProviderModel,
} from "@comma-agents/core";
import { listCoreProviders, refreshCoreProviders } from "./catalog";
import type { ProviderAuthentication } from "@comma-agents/core";
import type { CoreProviders } from "./providers.types";

/**
 * Assemble core API delegation with the owning plugin's verification lifetime.
 * @param {AbortSignal} signal - Aborted when the owning plugin is disposed.
 * @param {ProviderAuthentication} authentication - Core-owned subscription sign-in lifetime.
 * @returns {CoreProviders} Delegates to reusable core provider operations.
 */
export function createCoreProviders(
  signal: AbortSignal,
  authentication: ProviderAuthentication,
): CoreProviders {
  return {
    beginSignIn: authentication.beginSignIn,
    getSignInStatus: authentication.getSignInStatus,
    cancelSignIn: authentication.cancelSignIn,
    list: listCoreProviders,
    refresh: refreshCoreProviders,
    getConfiguration: getProviderConfiguration,
    configure: configureProvider,
    removeCredential: removeProviderCredential,
    verify: (options) => verifyProvider(options, { signal }),
    addCustomProvider,
    updateCustomProvider,
    removeCustomProvider,
    addCustomProviderModel,
    removeCustomProviderModel,
  };
}
