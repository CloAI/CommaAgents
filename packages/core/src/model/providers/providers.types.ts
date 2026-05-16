import type { Credential } from "../../credentials/credentials.types";
import type { ProviderFactory } from "../model.types";

/**
 * Provenance of a resolved model list.
 *
 * - `"catalog"` — models.dev baseline (bundled snapshot or refreshed copy).
 * - `"live"` — returned only from a provider's listModels callback (no catalog overlap).
 * - `"merged"` — catalog baseline overlaid with live results.
 * - `"error"` — live discovery failed; falling back to catalog or empty.
 */
export type ModelsSource = "catalog" | "live" | "merged" | "error";

/** Supported input/output modality identifiers used by the catalog. */
export type Modality = "text" | "image" | "audio" | "video" | "pdf";

/** Release/availability status of a model, when known. */
export type ModelStatus = "alpha" | "beta" | "deprecated";

/** Coarse-grained capability flags derived from the catalog or live responses. */
export interface ModelCapabilities {
  /** Supports tool/function calling. */
  readonly tools?: boolean;
  /** Supports reasoning / chain-of-thought. */
  readonly reasoning?: boolean;
  /** Accepts image inputs. */
  readonly vision?: boolean;
  /** Accepts file attachments (images, PDFs, audio). */
  readonly attachment?: boolean;
  /** Supports a dedicated structured-output feature. */
  readonly structuredOutput?: boolean;
}

/** Per-million-token prices in USD. */
export interface ModelCost {
  /** Cost per 1M input tokens. */
  readonly input?: number;
  /** Cost per 1M output tokens. */
  readonly output?: number;
  /** Cost per 1M reasoning tokens. */
  readonly reasoning?: number;
  /** Cost per 1M cache-read tokens. */
  readonly cacheRead?: number;
  /** Cost per 1M cache-write tokens. */
  readonly cacheWrite?: number;
}

/** Supported modalities. */
export interface ModelModalities {
  readonly input?: readonly Modality[];
  readonly output?: readonly Modality[];
}

/**
 * Normalized metadata for a single model. Populated from the catalog,
 * a provider's live response, or a merge of the two.
 */
export interface ModelInfo {
  /** Model identifier as used in model strings (e.g., `"gpt-4o"`). */
  readonly id: string;
  /** Human-friendly display name. */
  readonly name?: string;
  /** Grouping label (e.g., `"claude-sonnet"`, `"gpt"`). */
  readonly family?: string;
  /** Maximum total context window in tokens. */
  readonly contextWindow?: number;
  /** Maximum input tokens allowed in a single request. */
  readonly maxInputTokens?: number;
  /** Maximum output tokens per response. */
  readonly maxOutputTokens?: number;
  /** Training knowledge cutoff, `YYYY-MM` or `YYYY-MM-DD`. */
  readonly knowledgeCutoff?: string;
  /** First public release date. */
  readonly releaseDate?: string;
  /** Last metadata update date. */
  readonly lastUpdated?: string;
  /** Release status (alpha/beta/deprecated). */
  readonly status?: ModelStatus;
  /** Supported input/output modalities. */
  readonly modalities?: ModelModalities;
  /** Capability flags. */
  readonly capabilities?: ModelCapabilities;
  /** Pricing information. */
  readonly cost?: ModelCost;
}

/** Arguments provided to a provider's live `listModels` callback. */
export interface ListModelsContext {
  /** Resolved credential for the provider, if any. */
  readonly credential?: Credential;
  /** Provider-specific base URL override (e.g., Ollama host, Copilot enterprise domain). */
  readonly baseURL?: string;
  /** Optional abort signal; callers typically attach a timeout. */
  readonly signal?: AbortSignal;
}

/**
 * Live model-listing callback supplied by a provider definition.
 *
 * Implementations should return the raw list from the provider's API.
 * Merge with the catalog baseline is handled by the registry, not here.
 */
export type ListModelsFn = (
  context: ListModelsContext,
) => Promise<readonly ModelInfo[]>;

/**
 * Full result of resolving the model list for a single provider.
 *
 * Returned by `listProviderModels()` to consumers (the daemon, tests).
 * `source` describes where the models came from; `error` is populated
 * when live discovery failed and we fell back to catalog or empty.
 */
export interface ListModelsResult {
  readonly models: readonly ModelInfo[];
  readonly source: ModelsSource;
  /** ISO timestamp when live data was fetched, if any. */
  readonly fetchedAt?: string;
  /** Error message when `source === "error"` or live fetch partially failed. */
  readonly error?: string;
}

/**
 * Everything the runtime knows about a provider: metadata from the
 * catalog plus optional runtime resolution/listing callbacks.
 */
export interface ProviderDefinition {
  /** Canonical provider id (matches models.dev keys, e.g., `"github-copilot"`). */
  readonly id: string;
  /** Human-friendly display name. */
  readonly name: string;
  /**
   * Live model-listing callback. When present, `listProviderModels()` will
   * call it and merge the response with the catalog.
   */
  readonly listModels?: ListModelsFn;
  /**
   * Direct factory for the provider's `LanguageModel` instances. When set,
   * takes precedence over `packageName`/`factoryName`.
   */
  readonly factory?: ProviderFactory;
  /**
   * npm package name used by the resolver to dynamically import the AI SDK
   * integration. Defaults to `@ai-sdk/<id>` when omitted.
   */
  readonly packageName?: string;
  /**
   * Export name on the imported module. Defaults to `create<ProviderId>`.
   */
  readonly factoryName?: string;
  /**
   * `true` when the definition was added via `registerProvider()` rather
   * than derived from the bundled catalog. Set automatically by the registry.
   */
  readonly isCustom?: boolean;
}
