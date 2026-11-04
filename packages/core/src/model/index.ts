export {
  registerModel,
  resetModelRegistry,
  resolveModel,
  unregisterModel,
} from "./model";
export type {
  ModelResolutionOptions,
  ParsedModel,
  ProviderFactory,
  ProviderInfo,
  ProviderResolver,
} from "./model.types";
export {
  extractProviderIds,
  formatProviderName,
  getModelCapabilities,
  getModelMetadata,
  getProviderInfo,
  getProviderPackage,
  getQualifiedModelMetadata,
  isKnownProvider,
  listProviders,
  parseModel,
} from "./model.utils";
export type {
  CatalogData,
  CatalogModel,
  CatalogProvider,
  ListModelsContext,
  ListModelsFn,
  Modality,
  ModelCapabilities,
  ModelCost,
  ModelInfo,
  ModelModalities,
  ModelStatus,
  ModelSource,
  ProviderOrigin,
  ProviderDefinition,
} from "./providers/index";
export {
  getCatalogModels,
  getCatalogProvider,
  getCatalogProviderSync,
  getCatalogSnapshot,
  getGlobalProviderResolver,
  getProviderDefinition,
  getProviderPackageNameSync,
  getProvidersForModel,
  getRegisteredProviderIds,
  getReverseModelIndex,
  isKnownProviderSync,
  refreshProviderModels,
  listCatalogProviders,
  listProviderDefinitions,
  listProviderModels,
  loadCatalog,
  mergeCatalogWithProvider,
  mergeModelInfo,
  refreshCatalog,
  registerProviderDefinition,
  resetCatalog,
  resetGlobalProviderResolver,
  resetProviderRegistry,
  resolveCredentialForProvider,
  setProviderInstallDirectory,
  sortModels,
  toModelInfo,
  unregisterProviderDefinition,
} from "./providers/index";

export {
  ModelInfoSchema,
  ProviderInfoSchema,
  ModelSourceSchema,
  ProviderOriginSchema,
} from "./providers/providers.schemas";
export { getModelFamily, resolveModelReference } from "./roles";
export type { ModelFamily, ModelRoleSources, ModelRoles } from "./roles";

export type {
  TinfoilPrivacyOptions,
  TinfoilMeasurementPins,
} from "./providers/tinfoil/tinfoil.types";
