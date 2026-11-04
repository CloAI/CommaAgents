import type { z } from "zod/v4";
import type {
  ModelMetadataSchema,
  ModalitySchema,
  ModelInfoSchema,
  ModelSourceSchema,
  ProviderOriginSchema,
  ProviderInfoSchema,
} from "./providers.schemas";
import type { Credential } from "../../credentials/credentials.types";
import type { ProviderFactory } from "../model.types";

/** Supported input/output modalities. */
export type Modality = z.output<typeof ModalitySchema>;
/** Model release status. */
export type ModelStatus = NonNullable<ProviderModelMetadata["status"]>;
/** Advertised feature support; absent flags are unknown, not verified. */
export type ModelCapabilities = NonNullable<
  ProviderModelMetadata["capabilities"]
>;
/** Per-million-token USD pricing. */
export type ModelCost = NonNullable<ProviderModelMetadata["cost"]>;
/** Supported input and output modalities. */
export type ModelModalities = NonNullable<ProviderModelMetadata["modalities"]>;
/** Credential mechanism expected by a provider. */
export type CredentialType = "api" | "oauth" | "custom" | "none";
/** A model identity and its merged metadata within a provider. */
export type ModelInfo = z.output<typeof ModelInfoSchema>;
/** Contributors to a resolved model entry. */
export type ModelSource = z.output<typeof ModelSourceSchema>;
/** Effective provider definition ownership. */
export type ProviderOrigin = z.output<typeof ProviderOriginSchema>;
/** Resolved provider and its model catalog. */
export type ProviderInfo = z.output<typeof ProviderInfoSchema>;

/** Arguments provided to a provider's `listModels` callback. */
export interface ListModelsContext {
  /** Resolved credential for the provider, if any. */
  readonly credential?: Credential;
  /** Provider-specific base URL override (e.g., Ollama host, Copilot enterprise domain). */
  readonly baseURL?: string;
  /** Optional abort signal; callers typically attach a timeout. */
  readonly signal?: AbortSignal;
}

/**
 * Model-listing callback supplied by a provider definition.
 *
 * Implementations normalize provider responses to model entries with provider sources.
 * Merge with the catalog baseline is handled by the registry, not here.
 */
export type ListModelsFn = (
  context: ListModelsContext,
) => Promise<readonly ModelInfo[]>;

/**
 * Everything the runtime knows about a provider: metadata from the
 * catalog plus optional runtime resolution/listing callbacks.
 */
export interface ProviderDefinition {
  /** Effective definition owner, assigned by the registry. */
  readonly origin?: ProviderOrigin;
  /** Complete API prefix for a declarative compatible endpoint. */
  readonly baseURL?: string;
  /** Canonical provider id (matches models.dev keys, e.g., `"github-copilot"`). */
  readonly id: string;
  /** Human-friendly display name. */
  readonly name: string;
  /**
   * Expected credential type for this provider.
   * Defaults to `"api"` for catalog-derived providers when not explicitly set.
   */
  readonly credentialType?: CredentialType;
  /**
   * Live model-listing callback. When present, `listProviderModels()` will
   * call it and merge the response with the catalog.
   */
  readonly listModels?: ListModelsFn;
  /**
   * Direct factory — given a credential, returns a `ProviderFactory`. When
   * set, takes precedence over `packageName`/`factoryName` in resolution.
   */
  readonly factory?: (
    credential: Credential,
  ) => ProviderFactory | Promise<ProviderFactory>;
  /**
   * npm package name used by the resolver to dynamically import the AI SDK
   * integration. Defaults to `@ai-sdk/<id>` when omitted.
   */
  readonly packageName?: string;
  /**
   * Export name on the imported module. Defaults to `create<ProviderId>`.
   */
  readonly factoryName?: string;
}

/** Optional metadata accepted for manually registered provider models. */
export type ProviderModelMetadata = z.output<typeof ModelMetadataSchema>;
