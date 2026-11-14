import type {
  DiscoveredProvider,
  ModelFilterValues,
  ProviderMatch,
} from "./useModelFilters.types";

/**
 * Narrow the catalog to the filtered providers and their matching models.
 * A provider whose name matches keeps all its models; an empty provider stays visible when its name matches and no capability is required.
 * @param {readonly DiscoveredProvider[]} providers - The full catalog.
 * @param {ModelFilterValues} filters - Search text, providers, and required capabilities.
 * @returns {ProviderMatch[]} Provider text matches first, preserving catalog order within each match group.
 */
export function filterProviders(
  providers: readonly DiscoveredProvider[],
  { search, providerIds, capabilities }: ModelFilterValues,
): ProviderMatch[] {
  const query = search.trim().toLowerCase();
  const providerTextMatches: ProviderMatch[] = [];
  const modelTextMatches: ProviderMatch[] = [];
  for (const provider of providers) {
    if (providerIds.length > 0 && !providerIds.includes(provider.id)) {
      continue;
    }
    const providerMatches = `${provider.id} ${provider.name}`
      .toLowerCase()
      .includes(query);
    const matchingModels = provider.models.filter(
      (model) =>
        (providerMatches ||
          `${model.id} ${model.metadata.name ?? ""} ${model.metadata.family ?? ""}`
            .toLowerCase()
            .includes(query)) &&
        capabilities.every(
          (capability) => model.metadata.capabilities?.[capability] === true,
        ),
    );
    const keepsEmptyProvider =
      provider.models.length === 0 &&
      capabilities.length === 0 &&
      providerMatches;
    if (matchingModels.length > 0 || keepsEmptyProvider) {
      const matches = providerMatches ? providerTextMatches : modelTextMatches;
      matches.push({ provider, models: matchingModels });
    }
  }
  return [...providerTextMatches, ...modelTextMatches];
}
