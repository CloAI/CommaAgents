import { Input } from "../../design-system/Input";
import type { ReactNode } from "react";
import type { ModelFilterValues } from "../../hooks/useModelFilters";
import type { DiscoveredProvider } from "./ModelFilters.types";
import { CapabilityFilter } from "./CapabilityFilter";
import { ProviderFilter } from "./ProviderFilter";
import styles from "./ModelFilters.module.scss";

/** The catalog to filter and the controlled filter state. */
export interface ModelFiltersProps {
  /** Providers offered by the provider filter. */
  readonly providers: readonly DiscoveredProvider[];
  /** Current filters. */
  readonly value: ModelFilterValues;
  /** Commit changed filters. */
  readonly onChange: (value: ModelFilterValues) => void;
  /** Catalog actions displayed beside the search field. */
  readonly searchActions?: ReactNode;
}

/**
 * Narrow the catalog by provider, required capabilities, and search text.
 * @param {ModelFiltersProps} props - Providers and controlled filters.
 * @returns {React.ReactElement} The three filter controls.
 */
export function ModelFilters({
  providers,
  value,
  onChange,
  searchActions,
}: ModelFiltersProps) {
  return (
    <div className={styles.modelFilters}>
      <div className={styles.searchRow}>
        <Input
          type="search"
          aria-label="Search providers and models"
          placeholder="Search providers and models"
          value={value.search}
          onChange={(event) =>
            onChange({ ...value, search: event.target.value })
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
            }
          }}
        />
        {searchActions}
      </div>
      <div className={styles.filterRow}>
        <ProviderFilter
          providers={providers}
          value={value.providerIds}
          onChange={(providerIds) => onChange({ ...value, providerIds })}
        />
        <CapabilityFilter
          value={value.capabilities}
          onChange={(capabilities) => onChange({ ...value, capabilities })}
        />
      </div>
    </div>
  );
}
