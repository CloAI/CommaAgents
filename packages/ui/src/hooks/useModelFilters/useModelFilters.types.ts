import type { DaemonChannelMap } from "@comma-agents/daemon/protocol";

/** Provider metadata returned by the daemon's discovery command. */
export type DiscoveredProvider =
  DaemonChannelMap["core.providers.list"]["message"]["data"]["providers"][number];

/** Model metadata returned by provider discovery. */
export type DiscoveredModel = DiscoveredProvider["models"][number];

/** Capability flags a model can declare. */
export type ModelCapability = keyof NonNullable<
  DiscoveredModel["metadata"]["capabilities"]
>;

/** What the catalog is narrowed to; empty lists include everything. */
export interface ModelFilterValues {
  /** Search text as typed. */
  readonly search: string;
  /** Providers to include. */
  readonly providerIds: readonly string[];
  /** Capabilities every shown model must have. */
  readonly capabilities: readonly ModelCapability[];
}

/** A provider and the models of it that pass the filters. */
export interface ProviderMatch {
  readonly provider: DiscoveredProvider;
  readonly models: readonly DiscoveredModel[];
}

/** Filters over a provider catalog and what they let through. */
export interface ModelFiltersState {
  /** Current filters. */
  readonly filters: ModelFilterValues;
  /** Commit changed filters. */
  readonly setFilters: (filters: ModelFilterValues) => void;
  /** Filtered providers with provider text matches first, in catalog order within each match group. */
  readonly providerMatches: readonly ProviderMatch[];
  /** Search text, trimmed and lowercased, for highlighting. */
  readonly searchQuery: string;
  /** Whether any filter narrows the catalog. */
  readonly isFiltering: boolean;
  /** Models across all matches. */
  readonly modelCount: number;
  /** Whether exactly one provider is filtered and it has no models at all. */
  readonly isOnlyProviderEmpty: boolean;
}
