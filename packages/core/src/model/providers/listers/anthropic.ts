import type { ListModelsFn, ModelInfo } from "../providers.types";

interface AnthropicModelsResponse {
  readonly data: readonly {
    readonly id: string;
    readonly display_name?: string;
    readonly max_input_tokens?: number | null;
    readonly max_tokens?: number | null;
  }[];
  readonly has_more: boolean;
  readonly last_id?: string | null;
}

/**
 * List all pages of models accessible to an Anthropic API key.
 * @param {ListModelsContext} context - API credential, optional API prefix, and cancellation.
 * @returns {Promise<readonly ModelInfo[]>} Models with available names and token limits.
 */
export const listAnthropicModels: ListModelsFn = async (context) => {
  if (context.credential?.type !== "api" || !context.credential.key)
    throw new Error("Anthropic listing requires an API credential");

  const baseURL = context.baseURL ?? "https://api.anthropic.com/v1";
  const signal = context.signal ?? AbortSignal.timeout(5_000);
  const models: ModelInfo[] = [];
  const cursors = new Set<string>();
  let afterId: string | undefined;

  do {
    const url = new URL(`${baseURL.replace(/\/$/, "")}/models`);
    url.searchParams.set("limit", "1000");
    if (afterId) url.searchParams.set("after_id", afterId);
    const response = await fetch(url.toString(), {
      signal,
      headers: {
        "x-api-key": context.credential.key,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!response.ok)
      throw new Error(
        `Anthropic ${response.status} ${response.statusText} at ${url}`,
      );

    const payload = (await response.json()) as AnthropicModelsResponse;
    models.push(
      ...payload.data.map((entry): ModelInfo => ({
        id: entry.id,
        sources: ["provider"],
        metadata: {
          ...(entry.display_name ? { name: entry.display_name } : {}),
          ...(entry.max_input_tokens != null
            ? { maxInputTokens: entry.max_input_tokens }
            : {}),
          ...(entry.max_tokens != null
            ? { maxOutputTokens: entry.max_tokens }
            : {}),
        },
      })),
    );
    if (!payload.has_more) break;
    if (!payload.last_id || cursors.has(payload.last_id))
      throw new Error("Anthropic returned an invalid model pagination cursor");
    afterId = payload.last_id;
    cursors.add(afterId);
  } while (afterId);

  return models;
};
