import type {
  ListModelsContext,
  ListModelsFn,
  ModelInfo,
} from "../providers.types";

const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";
const OLLAMA_FETCH_TIMEOUT_MS = 5_000;

interface OllamaTagsResponse {
  readonly models?: readonly {
    readonly name: string;
    readonly model?: string;
    readonly size?: number;
    readonly digest?: string;
    readonly modified_at?: string;
    readonly details?: {
      readonly family?: string;
      readonly parameter_size?: string;
      readonly quantization_level?: string;
    };
  }[];
}

/**
 * List locally installed Ollama models via `GET {baseURL}/api/tags`.
 *
 * Ollama is absent from the models.dev catalog because the set of installed
 * models is user-specific. This lister returns whatever the local daemon
 * reports; capabilities and context windows are unknown from the tags endpoint.
 */
export const listOllamaModels: ListModelsFn = async (
  context: ListModelsContext,
): Promise<readonly ModelInfo[]> => {
  const baseURL = context.baseURL ?? OLLAMA_DEFAULT_BASE_URL;
  const url = `${baseURL.replace(/\/$/, "")}/api/tags`;

  const signal = context.signal ?? AbortSignal.timeout(OLLAMA_FETCH_TIMEOUT_MS);

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Ollama ${response.status} ${response.statusText} at ${url}`,
    );
  }

  const payload = (await response.json()) as OllamaTagsResponse;
  const rawModels = payload.models ?? [];

  return rawModels.map((entry): ModelInfo => {
    const id = entry.model ?? entry.name;
    return {
      id,
      name: entry.name,
      ...(entry.details?.family ? { family: entry.details.family } : {}),
      ...(entry.modified_at
        ? { lastUpdated: entry.modified_at.slice(0, 10) }
        : {}),
    };
  });
};
