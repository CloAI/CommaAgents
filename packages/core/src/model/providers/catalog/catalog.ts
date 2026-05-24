import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ModelInfo } from "../providers.types";
import bundledSnapshot from "./catalog.data.json" with { type: "json" };
import type { CatalogData, CatalogProvider } from "./catalog.types";
import { resolveCatalogCachePath, toModelInfo } from "./catalog.utils";

/** Source URL for the live catalog. */
export const CATALOG_SOURCE_URL = "https://models.dev/api.json";

/** Default cache TTL — 24 hours. */
export const CATALOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Network fetch timeout for the catalog. */
const CATALOG_FETCH_TIMEOUT_MS = 5_000;

interface CachedCatalog {
  readonly fetchedAt: number;
  readonly data: CatalogData;
}

interface LoadedCatalog {
  readonly data: CatalogData;
  readonly source: "bundled" | "cache" | "network";
  readonly fetchedAt?: number;
}

let loadedCatalog: LoadedCatalog | undefined;

/**
 * Lazy-built reverse index: modelId → providerId[].
 * Built from the catalog snapshot on first access, invalidated on reset.
 */
let reverseModelIndex: Map<string, string[]> | undefined;

/** Force re-evaluation on next `loadCatalog()` call. Used by tests. */
export function resetCatalog(): void {
  loadedCatalog = undefined;
  reverseModelIndex = undefined;
}

/**
 * Synchronous snapshot access. Returns whatever is currently loaded in
 * memory, falling back to the bundled snapshot without touching disk or
 * network. Use this in sync paths (e.g., the provider resolver) where
 * awaiting is not practical.
 */
export function getCatalogSnapshot(): CatalogData {
  if (loadedCatalog) return loadedCatalog.data;
  return bundledSnapshot as CatalogData;
}

/** Sync counterpart to `getCatalogProvider`. */
export function getCatalogProviderSync(
  providerId: string,
): CatalogProvider | undefined {
  return getCatalogSnapshot()[providerId];
}

/**
 * Load the models.dev catalog, preferring (fresh cache) → (network refresh) →
 * (bundled snapshot). The first successful source wins; subsequent calls
 * return the memoized result until `resetCatalog()` is invoked.
 */
export async function loadCatalog(options?: {
  readonly forceRefresh?: boolean;
}): Promise<CatalogData> {
  if (!options?.forceRefresh && loadedCatalog) return loadedCatalog.data;

  const cachePath = resolveCatalogCachePath();

  if (!options?.forceRefresh) {
    const cached = readCache(cachePath);
    if (cached && Date.now() - cached.fetchedAt < CATALOG_CACHE_TTL_MS) {
      loadedCatalog = {
        data: cached.data,
        source: "cache",
        fetchedAt: cached.fetchedAt,
      };
      return cached.data;
    }
  }

  const networkData = await fetchCatalog();
  if (networkData) {
    const fetchedAt = Date.now();
    writeCache(cachePath, { fetchedAt, data: networkData });
    loadedCatalog = { data: networkData, source: "network", fetchedAt };
    return networkData;
  }

  const fallback = bundledSnapshot as CatalogData;
  loadedCatalog = { data: fallback, source: "bundled" };
  return fallback;
}

/**
 * Force a network refresh of the catalog. Updates the disk cache on success;
 * falls back to the existing cache or bundled snapshot on failure.
 */
export async function refreshCatalog(): Promise<CatalogData> {
  return await loadCatalog({ forceRefresh: true });
}

/** Look up a single provider entry from the catalog. */
export async function getCatalogProvider(
  providerId: string,
): Promise<CatalogProvider | undefined> {
  const data = await loadCatalog();
  return data[providerId];
}

/** Return every provider entry from the catalog. */
export async function listCatalogProviders(): Promise<
  readonly CatalogProvider[]
> {
  const data = await loadCatalog();
  return Object.values(data);
}

/** Return the normalized `ModelInfo[]` for a provider, or an empty array if unknown. */
export async function getCatalogModels(
  providerId: string,
): Promise<readonly ModelInfo[]> {
  const provider = await getCatalogProvider(providerId);
  if (!provider) return [];
  return Object.values(provider.models).map(toModelInfo);
}

/**
 * Build a reverse lookup from model IDs to the provider IDs that offer them.
 * Scans every provider in the catalog snapshot.
 */
function buildReverseModelIndex(snapshot: CatalogData): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const [providerId, provider] of Object.entries(snapshot)) {
    for (const modelId of Object.keys(provider.models)) {
      const list = index.get(modelId);
      if (list) {
        list.push(providerId);
      } else {
        index.set(modelId, [providerId]);
      }
    }
  }
  return index;
}

/**
 * Return a lazy-built reverse model index.
 *
 * The index maps each model ID (e.g. `"gpt-4o"`) to an alphabetically-sorted
 * array of provider IDs that list that model in the models.dev catalog.
 * Providers are sorted alphabetically for deterministic resolution order.
 *
 * Built once from `getCatalogSnapshot()` and invalidated via `resetCatalog()`.
 */
export function getReverseModelIndex(): Map<string, string[]> {
  if (reverseModelIndex) return reverseModelIndex;
  const snapshot = getCatalogSnapshot();
  const index = buildReverseModelIndex(snapshot);
  // Sort provider lists for deterministic resolution ordering.
  // TODO: when priority settings are implemented, apply a weighting/ranking
  // function here instead of simple alphabetical sort.
  for (const providers of index.values()) {
    providers.sort();
  }
  reverseModelIndex = index;
  return reverseModelIndex;
}

/**
 * Return the list of provider IDs known to offer a given model ID.
 *
 * Only includes providers registered in the models.dev catalog. Live-only
 * providers (ollama, GitHub Copilot models fetched at runtime) are NOT
 * included here.
 *
 * @param modelId - The bare model ID to look up (e.g. `"gpt-4o"`).
 * @returns Sorted array of provider IDs, or empty array if unknown.
 */
export function getProvidersForModel(modelId: string): string[] {
  return getReverseModelIndex().get(modelId) ?? [];
}

/**
 * Build a reverse lookup from model IDs to the provider IDs that offer them.
 * Scans every provider in the catalog snapshot.
 */
function buildReverseModelIndex(snapshot: CatalogData): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const [providerId, provider] of Object.entries(snapshot)) {
    for (const modelId of Object.keys(provider.models)) {
      const list = index.get(modelId);
      if (list) {
        list.push(providerId);
      } else {
        index.set(modelId, [providerId]);
      }
    }
  }
  return index;
}

/**
 * Return a lazy-built reverse model index.
 *
 * The index maps each model ID (e.g. `"gpt-4o"`) to an alphabetically-sorted
 * array of provider IDs that list that model in the models.dev catalog.
 * Providers are sorted alphabetically for deterministic resolution order.
 *
 * Built once from `getCatalogSnapshot()` and invalidated via `resetCatalog()`.
 */
export function getReverseModelIndex(): Map<string, string[]> {
  if (reverseModelIndex) return reverseModelIndex;
  const snapshot = getCatalogSnapshot();
  const index = buildReverseModelIndex(snapshot);
  // Sort provider lists for deterministic resolution ordering.
  // TODO: when priority settings are implemented, apply a weighting/ranking
  // function here instead of simple alphabetical sort.
  for (const providers of index.values()) {
    providers.sort();
  }
  reverseModelIndex = index;
  return reverseModelIndex;
}

/**
 * Return the list of provider IDs known to offer a given model ID.
 *
 * Only includes providers registered in the models.dev catalog. Live-only
 * providers (ollama, GitHub Copilot models fetched at runtime) are NOT
 * included here.
 *
 * @param modelId - The bare model ID to look up (e.g. `"gpt-4o"`).
 * @returns Sorted array of provider IDs, or empty array if unknown.
 */
export function getProvidersForModel(modelId: string): string[] {
  return getReverseModelIndex().get(modelId) ?? [];
}

function readCache(cachePath: string): CachedCatalog | undefined {
  try {
    const raw = readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw) as CachedCatalog;
    if (
      typeof parsed?.fetchedAt !== "number" ||
      typeof parsed?.data !== "object"
    )
      return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeCache(cachePath: string, payload: CachedCatalog): void {
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(payload), "utf8");
  } catch {
    // Cache write is best-effort — a readonly filesystem must not crash the caller.
  }
}

async function fetchCatalog(): Promise<CatalogData | undefined> {
  try {
    const response = await fetch(CATALOG_SOURCE_URL, {
      signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    return (await response.json()) as CatalogData;
  } catch {
    return undefined;
  }
}
