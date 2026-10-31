import type {
  ListModelsContext,
  ListModelsFn,
  ModelInfo,
} from "../providers.types";

const VENICE_DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
const VENICE_FETCH_TIMEOUT_MS = 5_000;

interface VeniceModelsResponse {
  readonly data?: readonly {
    readonly id: string;
    readonly type?: string;
    readonly model_spec?: {
      readonly name?: string;
      readonly availableContextTokens?: number;
      readonly offline?: boolean;
      readonly capabilities?: {
        readonly supportsFunctionCalling?: boolean;
        readonly supportsReasoning?: boolean;
        readonly supportsVision?: boolean;
        readonly supportsResponseSchema?: boolean;
        readonly supportsTeeAttestation?: boolean;
        readonly supportsE2EE?: boolean;
      };
      readonly pricing?: {
        readonly input?: { readonly usd?: number };
        readonly output?: { readonly usd?: number };
      };
    };
  }[];
}

/**
 * List available Venice text models with capabilities, context limits, and USD pricing.
 * @param {ListModelsContext} context - API credential, optional base URL, and abort signal.
 * @returns {Promise<readonly ModelInfo[]>} Available text models with normalized metadata.
 * @example
 * ```ts
 * await listVeniceModels({ credential: { type: "api", key: "venice-key" } });
 * ```
 */
export const listVeniceModels: ListModelsFn = async (
  context: ListModelsContext,
): Promise<readonly ModelInfo[]> => {
  if (context.credential?.type !== "api" || !context.credential.key) {
    throw new Error("Venice listing requires an API credential");
  }

  const baseURL = context.baseURL ?? VENICE_DEFAULT_BASE_URL;
  const url = `${baseURL.replace(/\/$/, "")}/models`;
  const response = await fetch(url, {
    signal: context.signal ?? AbortSignal.timeout(VENICE_FETCH_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${context.credential.key}` },
  });
  if (!response.ok) {
    throw new Error(
      `Venice ${response.status} ${response.statusText} at ${url}`,
    );
  }

  const payload = (await response.json()) as VeniceModelsResponse;
  return (payload.data ?? [])
    .filter(
      (entry) =>
        (entry.type === undefined || entry.type === "text") &&
        entry.model_spec?.offline !== true,
    )
    .map((entry): ModelInfo => {
      const specification = entry.model_spec;
      const capabilities = specification?.capabilities;
      const pricing = specification?.pricing;
      return {
        id: entry.id,
        sources: ["provider"],
        metadata: {
          ...(specification?.name ? { name: specification.name } : {}),
          ...(specification?.availableContextTokens !== undefined
            ? { contextWindow: specification.availableContextTokens }
            : {}),
          ...(capabilities
            ? {
                capabilities: {
                  ...(capabilities.supportsFunctionCalling !== undefined
                    ? { tools: capabilities.supportsFunctionCalling }
                    : {}),
                  ...(capabilities.supportsReasoning !== undefined
                    ? { reasoning: capabilities.supportsReasoning }
                    : {}),
                  ...(capabilities.supportsVision !== undefined
                    ? { vision: capabilities.supportsVision }
                    : {}),
                  ...(capabilities.supportsResponseSchema !== undefined
                    ? { structuredOutput: capabilities.supportsResponseSchema }
                    : {}),
                  ...(capabilities.supportsTeeAttestation !== undefined
                    ? { teeAttestation: capabilities.supportsTeeAttestation }
                    : {}),
                  ...(capabilities.supportsE2EE !== undefined
                    ? { e2ee: capabilities.supportsE2EE }
                    : {}),
                },
              }
            : {}),
          ...(pricing
            ? {
                cost: {
                  ...(pricing.input?.usd !== undefined
                    ? { input: pricing.input.usd }
                    : {}),
                  ...(pricing.output?.usd !== undefined
                    ? { output: pricing.output.usd }
                    : {}),
                },
              }
            : {}),
        },
      };
    });
};
