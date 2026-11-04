import type { ProvidersSnapshot } from "../../core.types";

/** The daemon's provider list and the rebuilds that keep it current. */
export interface ProviderCatalog {
  /** Latest published provider list. */
  readonly snapshot: () => ProvidersSnapshot;
  /** Resolve once a snapshot has been built, building one if nothing has started. */
  readonly ready: () => Promise<void>;
  /** Call every provider's API without re-downloading models.dev. */
  readonly load: () => Promise<void>;
  /** Re-download models.dev, then call every provider's API. */
  readonly refresh: () => Promise<void>;
  /** Call one provider's API again, after its credential or definition changed. */
  readonly refreshProvider: (providerId: string) => Promise<void>;
  /** Re-merge stored data without network requests. */
  readonly rebuild: () => Promise<void>;
}
