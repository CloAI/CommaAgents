import { homedir } from "node:os";
import { join } from "node:path";
import type { Modality, ModelCapabilities, ModelCost, ModelInfo, ModelModalities, ModelStatus } from "../providers.types";
import type { CatalogModel } from "./catalog.types";

const KNOWN_MODALITIES: ReadonlySet<Modality> = new Set(["text", "image", "audio", "video", "pdf"]);
const KNOWN_STATUSES: ReadonlySet<ModelStatus> = new Set(["alpha", "beta", "deprecated"]);

/** Keep only modality strings we recognize; drops anything unexpected. */
function filterModalities(raw: readonly string[] | undefined): readonly Modality[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const filtered = raw.filter((modality): modality is Modality =>
    KNOWN_MODALITIES.has(modality as Modality),
  );
  return filtered.length > 0 ? filtered : undefined;
}

/** Convert models.dev status strings to our ModelStatus enum, dropping unknown values. */
function normalizeStatus(raw: string | undefined): ModelStatus | undefined {
  if (!raw) return undefined;
  return KNOWN_STATUSES.has(raw as ModelStatus) ? (raw as ModelStatus) : undefined;
}

/** Map a raw catalog model entry to our normalized `ModelInfo` shape. */
export function toModelInfo(catalogModel: CatalogModel): ModelInfo {
  const inputModalities = filterModalities(catalogModel.modalities?.input);
  const outputModalities = filterModalities(catalogModel.modalities?.output);
  const modalities: ModelModalities | undefined =
    inputModalities || outputModalities
      ? {
          ...(inputModalities ? { input: inputModalities } : {}),
          ...(outputModalities ? { output: outputModalities } : {}),
        }
      : undefined;

  const supportsVision = inputModalities?.includes("image") ?? false;
  const capabilities: ModelCapabilities = {
    tools: catalogModel.tool_call,
    reasoning: catalogModel.reasoning,
    vision: supportsVision,
    attachment: catalogModel.attachment,
    ...(catalogModel.structured_output !== undefined
      ? { structuredOutput: catalogModel.structured_output }
      : {}),
  };

  const rawCost = catalogModel.cost;
  const cost: ModelCost | undefined = rawCost
    ? {
        ...(rawCost.input !== undefined ? { input: rawCost.input } : {}),
        ...(rawCost.output !== undefined ? { output: rawCost.output } : {}),
        ...(rawCost.reasoning !== undefined ? { reasoning: rawCost.reasoning } : {}),
        ...(rawCost.cache_read !== undefined ? { cacheRead: rawCost.cache_read } : {}),
        ...(rawCost.cache_write !== undefined ? { cacheWrite: rawCost.cache_write } : {}),
      }
    : undefined;

  const status = normalizeStatus(catalogModel.status);

  return {
    id: catalogModel.id,
    name: catalogModel.name,
    ...(catalogModel.family ? { family: catalogModel.family } : {}),
    ...(catalogModel.limit?.context !== undefined
      ? { contextWindow: catalogModel.limit.context }
      : {}),
    ...(catalogModel.limit?.input !== undefined ? { maxInputTokens: catalogModel.limit.input } : {}),
    ...(catalogModel.limit?.output !== undefined
      ? { maxOutputTokens: catalogModel.limit.output }
      : {}),
    ...(catalogModel.knowledge ? { knowledgeCutoff: catalogModel.knowledge } : {}),
    ...(catalogModel.release_date ? { releaseDate: catalogModel.release_date } : {}),
    ...(catalogModel.last_updated ? { lastUpdated: catalogModel.last_updated } : {}),
    ...(status ? { status } : {}),
    ...(modalities ? { modalities } : {}),
    capabilities,
    ...(cost ? { cost } : {}),
  };
}

/** Filename used for the on-disk catalog snapshot. */
export const CATALOG_CACHE_FILENAME = "models-catalog.json";

/**
 * Resolve the platform-aware cache directory for comma-agents.
 *
 * Mirrors the conventions used by `resolveDataDir` but targets cache storage:
 * - macOS:   ~/Library/Caches/comma-agents/
 * - Windows: %LOCALAPPDATA%/comma-agents/Cache/ (fallback ~/AppData/Local)
 * - Linux:   $XDG_CACHE_HOME/comma-agents/ (fallback ~/.cache)
 */
export function resolveCatalogCachePath(
  env: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") {
    const base = env.LOCALAPPDATA && env.LOCALAPPDATA.length > 0
      ? env.LOCALAPPDATA
      : join(homedir(), "AppData", "Local");
    return join(base, "comma-agents", "Cache", CATALOG_CACHE_FILENAME);
  }

  if (platform === "darwin") {
    return join(homedir(), "Library", "Caches", "comma-agents", CATALOG_CACHE_FILENAME);
  }

  // Linux and other Unix — XDG Base Directory Specification
  const xdgCacheHome = env.XDG_CACHE_HOME;
  const base = xdgCacheHome && xdgCacheHome.length > 0 ? xdgCacheHome : join(homedir(), ".cache");
  return join(base, "comma-agents", CATALOG_CACHE_FILENAME);
}
