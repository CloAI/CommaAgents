import type { ModelInfo } from "./providers.types";

/**
 * Merge a catalog baseline with a provider's live model list.
 *
 * Strategy (follows opencode's layering approach):
 * - Only models present in the live list survive (live is authoritative for membership).
 * - Each surviving model starts from the catalog entry (rich metadata) and is
 *   overlaid with the live entry's fields — live wins for runtime-relevant
 *   capabilities and limits, catalog fills in missing cost / release dates / names.
 * - Models present live but not in the catalog are included as-is.
 */
export function mergeCatalogWithLive(
  catalogModels: readonly ModelInfo[],
  liveModels: readonly ModelInfo[],
): readonly ModelInfo[] {
  const catalogById = new Map<string, ModelInfo>(
    catalogModels.map((model) => [model.id, model]),
  );

  return liveModels.map((liveModel) => {
    const catalogModel = catalogById.get(liveModel.id);
    if (!catalogModel) return liveModel;
    return mergeModelInfo(catalogModel, liveModel);
  });
}

/** Merge two `ModelInfo` entries, preferring `overlay` fields when present. */
export function mergeModelInfo(base: ModelInfo, overlay: ModelInfo): ModelInfo {
  return {
    id: overlay.id,
    name: overlay.name ?? base.name,
    family: overlay.family ?? base.family,
    contextWindow: overlay.contextWindow ?? base.contextWindow,
    maxInputTokens: overlay.maxInputTokens ?? base.maxInputTokens,
    maxOutputTokens: overlay.maxOutputTokens ?? base.maxOutputTokens,
    knowledgeCutoff: overlay.knowledgeCutoff ?? base.knowledgeCutoff,
    releaseDate: overlay.releaseDate ?? base.releaseDate,
    lastUpdated: overlay.lastUpdated ?? base.lastUpdated,
    status: overlay.status ?? base.status,
    modalities: overlay.modalities ?? base.modalities,
    capabilities:
      overlay.capabilities || base.capabilities
        ? { ...base.capabilities, ...overlay.capabilities }
        : undefined,
    cost: overlay.cost ?? base.cost,
  };
}

/** Sort models by id for stable output. */
export function sortModels(models: readonly ModelInfo[]): readonly ModelInfo[] {
  return [...models].sort((left, right) => left.id.localeCompare(right.id));
}
