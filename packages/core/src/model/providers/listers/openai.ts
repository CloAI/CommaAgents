import type { ListModelsFn, ModelInfo } from "../providers.types";

interface OpenAIModelsResponse {
  readonly data: readonly { readonly id: string }[];
}

/**
 * List models accessible to an OpenAI API key.
 * @param {ListModelsContext} context - API credential, optional API prefix, and cancellation.
 * @returns {Promise<readonly ModelInfo[]>} Model IDs for catalog enrichment.
 */
export const listOpenAIModels: ListModelsFn = async (context) => {
  if (context.credential?.type !== "api" || !context.credential.key) {
    throw new Error("OpenAI listing requires an API credential");
  }

  const baseURL = context.baseURL ?? "https://api.openai.com/v1";
  const url = `${baseURL.replace(/\/$/, "")}/models`;
  const response = await fetch(url, {
    signal: context.signal ?? AbortSignal.timeout(5_000),
    headers: { Authorization: `Bearer ${context.credential.key}` },
  });
  if (!response.ok) {
    throw new Error(
      `OpenAI ${response.status} ${response.statusText} at ${url}`,
    );
  }

  const payload = (await response.json()) as OpenAIModelsResponse;
  return payload.data.map((entry): ModelInfo => ({
    id: entry.id,
    sources: ["provider"],
    metadata: {},
  }));
};
