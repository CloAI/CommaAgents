import type { ModelCapabilities, ModelCost, ModelModalities, ModelStatus } from "../providers.types";

/** Raw model entry shape used by `https://models.dev/api.json`. */
export interface CatalogModel {
  readonly id: string;
  readonly name: string;
  readonly family?: string;
  readonly attachment: boolean;
  readonly reasoning: boolean;
  readonly tool_call: boolean;
  readonly temperature?: boolean;
  readonly structured_output?: boolean;
  readonly open_weights: boolean;
  readonly interleaved?: boolean | { readonly field?: string };
  readonly knowledge?: string;
  readonly release_date: string;
  readonly last_updated: string;
  readonly status?: ModelStatus | string;
  readonly modalities: {
    readonly input: readonly string[];
    readonly output: readonly string[];
  };
  readonly limit: {
    readonly context: number;
    readonly input?: number;
    readonly output: number;
  };
  readonly cost?: {
    readonly input?: number;
    readonly output?: number;
    readonly reasoning?: number;
    readonly cache_read?: number;
    readonly cache_write?: number;
    readonly input_audio?: number;
    readonly output_audio?: number;
  };
}

/** Raw provider entry shape used by `https://models.dev/api.json`. */
export interface CatalogProvider {
  readonly id: string;
  readonly name: string;
  readonly npm: string;
  readonly env: readonly string[];
  readonly doc: string;
  readonly api?: string;
  readonly models: Readonly<Record<string, CatalogModel>>;
}

/** Top-level shape: provider-id → provider entry. */
export type CatalogData = Readonly<Record<string, CatalogProvider>>;

/** Internal normalized intermediates used by the mapper. */
export interface NormalizedCapabilities {
  readonly capabilities?: ModelCapabilities;
  readonly modalities?: ModelModalities;
  readonly cost?: ModelCost;
}
