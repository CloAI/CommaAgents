import type {
  getProviderConfiguration,
  configureProvider,
  removeProviderCredential,
  verifyProvider,
  addCustomProvider,
  updateCustomProvider,
  removeCustomProvider,
  addCustomProviderModel,
  removeCustomProviderModel,
  ProviderInfo,
  ProviderAuthentication,
} from "@comma-agents/core";
import type { CoreProviderListOptions } from "../core.types";

/** Core-owned provider behavior exposed by the daemon aggregation layer. */
export interface CoreProviders extends Omit<ProviderAuthentication, "dispose"> {
  /** List provider configuration and model metadata through core discovery. */
  readonly list: (
    options?: CoreProviderListOptions,
  ) => Promise<readonly ProviderInfo[]>;
  /** Refresh catalog metadata and query the selected provider for live models. */
  readonly refresh: (options: {
    readonly providerId: string;
    readonly scope?: string;
  }) => Promise<ProviderInfo>;
  /** Read effective credential state and editable user-owned configuration, without secrets. */
  readonly getConfiguration: typeof getProviderConfiguration;
  /** Save or replace a global API key without a verification request. */
  readonly configure: typeof configureProvider;
  /** Remove only the saved global credential and report remaining configuration. */
  readonly removeCredential: typeof removeProviderCredential;
  /** Make one explicitly requested, non-generation access check. */
  readonly verify: (
    options: Parameters<typeof verifyProvider>[0],
  ) => ReturnType<typeof verifyProvider>;
  /** Persist an OpenAI-compatible endpoint owned by the user. */
  readonly addCustomProvider: typeof addCustomProvider;
  /** Update a persisted endpoint without changing its identity. */
  readonly updateCustomProvider: typeof updateCustomProvider;
  /** Remove an owned endpoint and its saved global credential. */
  readonly removeCustomProvider: typeof removeCustomProvider;
  /** Add a provider-local model ID without making a provider request. */
  readonly addCustomProviderModel: typeof addCustomProviderModel;
  /** Remove only a user-added model overlay. */
  readonly removeCustomProviderModel: typeof removeCustomProviderModel;
}
