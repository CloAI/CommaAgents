import { z } from "zod";
import type { ListModelsFn } from "../providers.types";
import { TINFOIL_CATALOG_URL } from "../tinfoil/tinfoil.constants";

const modelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      type: z.string().optional(),
      endpoints: z.array(z.string()).optional(),
      context_window: z.number().positive().optional(),
      tool_calling: z.boolean().optional(),
      reasoning: z.boolean().optional(),
      multimodal: z.boolean().optional(),
      pricing: z
        .object({
          inputTokenPricePer1M: z.number().nonnegative().optional(),
          outputTokenPricePer1M: z.number().nonnegative().optional(),
          cachedInputTokenPricePer1M: z.number().nonnegative().optional(),
        })
        .optional(),
    }),
  ),
});

/**
 * List Tinfoil chat models with advertised features and automatic privacy requirements.
 * @param {ListModelsContext} context - Credential ownership and cancellation.
 * @returns {Promise<readonly ModelInfo[]>} Supported chat completion models and metadata.
 */
export const listTinfoilModels: ListModelsFn = async (context) => {
  if (context.baseURL) {
    throw new Error("Tinfoil discovery does not support endpoint overrides");
  }
  const response = await fetch(TINFOIL_CATALOG_URL, {
    redirect: "error",
    signal: context.signal
      ? AbortSignal.any([context.signal, AbortSignal.timeout(5_000)])
      : AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`Tinfoil model listing failed: HTTP ${response.status}`);
  }
  const payload = modelsSchema.parse(await response.json());
  return payload.data
    .filter((model) =>
      model.endpoints
        ? model.endpoints.includes("/v1/chat/completions")
        : model.type === "chat",
    )
    .map((model) => ({
      id: model.id,
      sources: ["provider"],
      metadata: {
        ...(model.name ? { name: model.name } : {}),
        ...(model.context_window
          ? { contextWindow: model.context_window }
          : {}),
        capabilities: {
          teeAttestation: true,
          e2ee: true,
          ...(model.tool_calling !== undefined
            ? { tools: model.tool_calling }
            : {}),
          ...(model.reasoning !== undefined
            ? { reasoning: model.reasoning }
            : {}),
          ...(model.multimodal !== undefined
            ? { vision: model.multimodal }
            : {}),
        },
        ...(model.pricing
          ? {
              cost: {
                input: model.pricing.inputTokenPricePer1M,
                output: model.pricing.outputTokenPricePer1M,
                cacheRead: model.pricing.cachedInputTokenPricePer1M,
              },
            }
          : {}),
      },
    }));
};
