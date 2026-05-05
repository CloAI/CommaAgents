import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import bundledSnapshot from "./catalog.data.json" with { type: "json" };
import { resolveCatalogCachePath, toModelInfo } from "./catalog.utils";
import type { CatalogData, CatalogProvider } from "./catalog.types";
import type { ModelInfo } from "../providers.types";

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

/** Force re-evaluation on next `loadCatalog()` call. Used by tests. */
export function resetCatalog(): void {
  loadedCatalog = undefined;
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
export function getCatalogProviderSync(providerId: string): CatalogProvider | undefined {
  return getCatalogSnapshot()[providerId];
}

/**
 * Load the models.dev catalog, preferring (fresh cache) → (network refresh) →
 * (bundled snapshot). The first successful source wins; subsequent calls
 * return the memoized result until `resetCatalog()` is invoked.
 */
export async function loadCatalog(options?: { readonly forceRefresh?: boolean }): Promise<CatalogData> {
  if (!options?.forceRefresh && loadedCatalog) return loadedCatalog.data;

  const cachePath = resolveCatalogCachePath();

  if (!options?.forceRefresh) {
    const cached = readCache(cachePath);
    if (cached && Date.now() - cached.fetchedAt < CATALOG_CACHE_TTL_MS) {
      loadedCatalog = { data: cached.data, source: "cache", fetchedAt: cached.fetchedAt };
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
export async function getCatalogProvider(providerId: string): Promise<CatalogProvider | undefined> {
  const data = await loadCatalog();
  return data[providerId];
}

/** Return every provider entry from the catalog. */
export async function listCatalogProviders(): Promise<readonly CatalogProvider[]> {
  const data = await loadCatalog();
  return Object.values(data);
}

/** Return the normalized `ModelInfo[]` for a provider, or an empty array if unknown. */
export async function getCatalogModels(providerId: string): Promise<readonly ModelInfo[]> {
  const provider = await getCatalogProvider(providerId);
  if (!provider) return [];
  return Object.values(provider.models).map(toModelInfo);
}

function readCache(cachePath: string): CachedCatalog | undefined {
  try {
    const raw = readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw) as CachedCatalog;
    if (typeof parsed?.fetchedAt !== "number" || typeof parsed?.data !== "object") return undefined;
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
