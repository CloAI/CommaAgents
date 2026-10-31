import {
  getGlobalCredentialStore,
  listProviders,
  refreshCatalog,
  getProviderDefinition,
  getProviderInfo,
  listProviderDefinitions,
} from "@comma-agents/core";
import type { CoreProviderListOptions } from "../../core.types";

/**
 * Query core provider metadata without owning another catalog or credential store.
 * @param {CoreProviderListOptions} options - Core discovery scope and live-query switch.
 * @returns {Promise<readonly ProviderInfo[]>} Provider and model metadata from core.
 */
export function listCoreProviders(options: CoreProviderListOptions = {}) {
  return listProviders(getGlobalCredentialStore(), options);
}

/**
 * Refresh catalog metadata before querying one provider for live models.
 * @param {{providerId: string, scope?: string}} options - Provider identity and credential resolution scope.
 * @returns {Promise<ProviderInfo>} Refreshed metadata for the selected provider.
 */
export async function refreshCoreProviders({
  providerId,
  scope,
}: {
  readonly providerId: string;
  readonly scope?: string;
}) {
  if (!(await getProviderDefinition(providerId)))
    throw Object.assign(new Error("Provider was not found."), {
      code: "NOT_FOUND",
    });
  await refreshCatalog();
  await listProviderDefinitions();
  return getProviderInfo(providerId, getGlobalCredentialStore(), {
    scope,
    live: true,
  });
}
