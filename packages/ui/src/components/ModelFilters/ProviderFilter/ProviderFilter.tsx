import { MultiSelect } from "../../../design-system/MultiSelect";
import type { DiscoveredProvider } from "../ModelFilters.types";

/** Searchable provider selection for the model catalog. */
export interface ProviderFilterProps {
  /** Provider names and identifiers available to search. */
  readonly providers: readonly DiscoveredProvider[];
  /** Selected provider IDs; an empty list includes every provider. */
  readonly value: readonly string[];
  /** Commit a provider selection. */
  readonly onChange: (value: readonly string[]) => void;
}

/**
 * Search provider names and IDs through the shared multi-select.
 * @param {ProviderFilterProps} props - Provider catalog and controlled selection.
 * @returns {React.ReactElement} The provider filter.
 */
export function ProviderFilter({
  providers,
  value,
  onChange,
}: ProviderFilterProps) {
  return (
    <MultiSelect
      label="Filter by provider"
      listLabel="Providers"
      emptyLabel="All providers"
      options={providers.map((provider) => ({
        value: provider.id,
        label: provider.name,
        description: provider.id,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
