import { getCatalogProviderSync } from "./catalog";
import { BUILT_IN_OVERRIDES } from "./providers.constant";
import type {
  ModelInfo,
  ProviderDefinition,
  ProviderModelMetadata,
} from "./providers.types";

/**
 * Merge model membership and metadata; overlay values win, including false and zero.
 * @param {readonly ModelInfo[]} catalogModels - Catalog baseline.
 * @param {readonly ModelInfo[]} providerModels - Provider-listed models taking field precedence.
 * @returns {readonly ModelInfo[]} Union of model IDs with merged metadata.
 */
export function mergeCatalogWithProvider(
  catalogModels: readonly ModelInfo[],
  providerModels: readonly ModelInfo[],
): readonly ModelInfo[] {
  const byId = new Map(catalogModels.map((model) => [model.id, model]));
  for (const model of providerModels) {
    const existing = byId.get(model.id);
    byId.set(model.id, existing ? mergeModelInfo(existing, model) : model);
  }
  return sortModels([...byId.values()]);
}

/**
 * Overlay defined fields while retaining explicit false, zero, and empty arrays.
 * @param {Fields} base - Lower-priority fields.
 * @param {Fields} overlay - Higher-priority fields.
 * @returns {Fields} Defined overlay fields combined with baseline fields.
 */
function mergeDefinedFields<Fields extends object>(
  base: Fields,
  overlay: Fields,
): Fields {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(overlay).filter(([, value]) => value !== undefined),
    ),
  };
}

/**
 * Merge metadata individually, treating modality arrays as complete values.
 * @param {ProviderModelMetadata} base - Lower-priority metadata.
 * @param {ProviderModelMetadata} overlay - Higher-priority metadata.
 * @returns {ProviderModelMetadata} Metadata resolved per nested field.
 */
function mergeModelMetadata(
  base: ProviderModelMetadata,
  overlay: ProviderModelMetadata,
): ProviderModelMetadata {
  return {
    ...mergeDefinedFields(base, overlay),
    ...(base.capabilities || overlay.capabilities
      ? {
          capabilities: mergeDefinedFields(
            base.capabilities ?? {},
            overlay.capabilities ?? {},
          ),
        }
      : {}),
    ...(base.modalities || overlay.modalities
      ? {
          modalities: mergeDefinedFields(
            base.modalities ?? {},
            overlay.modalities ?? {},
          ),
        }
      : {}),
    ...(base.cost || overlay.cost
      ? { cost: mergeDefinedFields(base.cost ?? {}, overlay.cost ?? {}) }
      : {}),
  };
}

/**
 * Merge source membership and metadata with the overlay taking precedence.
 * @param {ModelInfo} base - Lower-priority model entry.
 * @param {ModelInfo} overlay - Higher-priority entry for the same ID.
 * @returns {ModelInfo} Combined sources and resolved metadata.
 */
export function mergeModelInfo(base: ModelInfo, overlay: ModelInfo): ModelInfo {
  return {
    id: overlay.id,
    sources: (["provider", "models.dev", "user"] as const).filter(
      (source) =>
        base.sources.includes(source) || overlay.sources.includes(source),
    ),
    metadata: mergeModelMetadata(base.metadata, overlay.metadata),
  };
}

/**
 * Sort models by exact ID for stable catalog output.
 * @param {readonly ModelInfo[]} models - Models to sort without mutation.
 * @returns {readonly ModelInfo[]} Alphabetically ordered copy.
 */
export function sortModels(models: readonly ModelInfo[]): readonly ModelInfo[] {
  return [...models].sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Restore a catalog or built-in provider definition.
 * @param {string} providerId - Exact provider identity.
 * @returns {ProviderDefinition | undefined} Default definition, when known.
 */
export function createDefaultProviderDefinition(
  providerId: string,
): ProviderDefinition | undefined {
  const catalogProvider = getCatalogProviderSync(providerId);
  const override = BUILT_IN_OVERRIDES.find((entry) => entry.id === providerId);

  if (catalogProvider === undefined && override === undefined) {
    return undefined;
  }

  return {
    ...(catalogProvider !== undefined
      ? {
          id: catalogProvider.id,
          name: catalogProvider.name,
          packageName: catalogProvider.npm,
        }
      : {}),
    ...override,
    origin: override ? "builtin" : "catalog",
    id: catalogProvider?.id ?? override?.id ?? providerId,
    name: catalogProvider?.name ?? override?.name ?? providerId,
  };
}
