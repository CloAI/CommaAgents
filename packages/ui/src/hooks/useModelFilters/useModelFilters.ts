import { useMemo, useState } from "react";
import { NO_FILTERS } from "./useModelFilters.constants";
import type {
  DiscoveredProvider,
  ModelFilterValues,
  ModelFiltersState,
} from "./useModelFilters.types";
import { filterProviders } from "./useModelFilters.utils";

/**
 * Hold provider, capability, and text filters over a catalog and derive what passes them.
 * @param {readonly DiscoveredProvider[]} providers - The full catalog.
 * @returns {ModelFiltersState} The filters, their setter, and the matches.
 */
export function useModelFilters(
  providers: readonly DiscoveredProvider[],
): ModelFiltersState {
  const [filters, setFilters] = useState<ModelFilterValues>(NO_FILTERS);
  const providerMatches = useMemo(
    () => filterProviders(providers, filters),
    [providers, filters],
  );
  const searchQuery = filters.search.trim().toLowerCase();
  const onlyProviderId =
    filters.providerIds.length === 1 ? filters.providerIds[0] : undefined;
  return {
    filters,
    setFilters,
    providerMatches,
    searchQuery,
    isFiltering:
      searchQuery !== "" ||
      filters.providerIds.length > 0 ||
      filters.capabilities.length > 0,
    modelCount: providerMatches.reduce(
      (total, match) => total + match.models.length,
      0,
    ),
    isOnlyProviderEmpty:
      providers.find((provider) => provider.id === onlyProviderId)?.models
        .length === 0,
  };
}
