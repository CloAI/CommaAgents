import type { ListModelsFn, ModelInfo } from "../providers.types";

interface GoogleModelsResponse {
  readonly models?: readonly {
    readonly name: string;
    readonly displayName?: string;
    readonly inputTokenLimit?: number;
    readonly outputTokenLimit?: number;
    readonly supportedGenerationMethods?: readonly string[];
    readonly thinking?: boolean;
  }[];
  readonly nextPageToken?: string;
}

/**
 * List all pages of Google models supporting content generation.
 * @param {ListModelsContext} context - API credential, optional API prefix, and cancellation.
 * @returns {Promise<readonly ModelInfo[]>} Provider-local model IDs and available token limits.
 */
export const listGoogleModels: ListModelsFn = async (context) => {
  if (context.credential?.type !== "api" || !context.credential.key) {
    throw new Error("Google listing requires an API credential");
  }

  const baseURL =
    context.baseURL ?? "https://generativelanguage.googleapis.com/v1beta";
  const signal = context.signal ?? AbortSignal.timeout(5_000);
  const models: ModelInfo[] = [];
  const pageTokens = new Set<string>();
  let pageToken: string | undefined;

  do {
    const url = new URL(`${baseURL.replace(/\/$/, "")}/models`);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const response = await fetch(url.toString(), {
      signal,
      headers: { "x-goog-api-key": context.credential.key },
    });
    if (!response.ok) {
      throw new Error(
        `Google ${response.status} ${response.statusText} at ${url}`,
      );
    }

    const payload = (await response.json()) as GoogleModelsResponse;
    models.push(
      ...(payload.models ?? [])
        .filter((entry) =>
          entry.supportedGenerationMethods?.includes("generateContent"),
        )
        .map((entry): ModelInfo => ({
          id: entry.name.replace(/^models\//, ""),
          sources: ["provider"],
          metadata: {
            ...(entry.displayName ? { name: entry.displayName } : {}),
            ...(entry.inputTokenLimit !== undefined
              ? { maxInputTokens: entry.inputTokenLimit }
              : {}),
            ...(entry.outputTokenLimit !== undefined
              ? { maxOutputTokens: entry.outputTokenLimit }
              : {}),
            ...(entry.thinking !== undefined
              ? { capabilities: { reasoning: entry.thinking } }
              : {}),
          },
        })),
    );
    pageToken = payload.nextPageToken;
    if (pageToken && pageTokens.has(pageToken)) {
      throw new Error("Google returned a repeated model pagination token");
    }
    if (pageToken) {
      pageTokens.add(pageToken);
    }
  } while (pageToken);

  return models;
};
