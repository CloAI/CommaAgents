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
import type { ProviderAuthentication } from "@comma-agents/core";
import type { ProviderCatalog } from "./catalog";
import type { CoreProviders } from "./providers.types";

/**
 * Assemble core API delegation, rebuilding the provider list after each change.
 * @param {AbortSignal} signal - Aborted when the owning plugin is disposed.
 * @param {ProviderAuthentication} authentication - Core-owned subscription sign-in lifetime.
 * @param {ProviderCatalog} catalog - The daemon's provider list.
 * @returns {CoreProviders} Delegates to reusable core provider operations.
 */
export function createCoreProviders(
  signal: AbortSignal,
  authentication: ProviderAuthentication,
  catalog: ProviderCatalog,
): CoreProviders {
  // Sign-in progress omits its provider, so remember it until the sign-in connects.
  const signIns = new Map<string, string>();
  return {
    async beginSignIn(options) {
      const start = await authentication.beginSignIn(options);
      signIns.set(start.attemptId, options.providerId);
      return start;
    },
    getSignInStatus(options) {
      const progress = authentication.getSignInStatus(options);
      const providerId = signIns.get(options.attemptId);
      if (progress.status === "connected" && providerId) {
        signIns.delete(options.attemptId);
        void catalog.refreshProvider(providerId);
      }
      return progress;
    },
    cancelSignIn: authentication.cancelSignIn,
    snapshot: catalog.snapshot,
    ready: catalog.ready,
    load: catalog.load,
    refresh: catalog.refresh,
    getConfiguration: getProviderConfiguration,
    async configure(options) {
      const result = await configureProvider(options);
      await catalog.refreshProvider(options.providerId);
      return result;
    },
    async removeCredential(options) {
      const result = await removeProviderCredential(options);
      await catalog.refreshProvider(options.providerId);
      return result;
    },
    verify: (options) => verifyProvider(options, { signal }),
    async addCustomProvider(options) {
      const result = await addCustomProvider(options);
      await catalog.refreshProvider(result.id);
      return result;
    },
    async updateCustomProvider(options) {
      const result = await updateCustomProvider(options);
      await catalog.refreshProvider(result.id);
      return result;
    },
    async removeCustomProvider(options) {
      const result = await removeCustomProvider(options);
      await catalog.refreshProvider(options.providerId);
      return result;
    },
    async addCustomProviderModel(options) {
      const result = await addCustomProviderModel(options);
      await catalog.rebuild();
      return result;
    },
    async removeCustomProviderModel(options) {
      const result = await removeCustomProviderModel(options);
      await catalog.rebuild();
      return result;
    },
  };
}
