import { z } from "zod/v4";

export const ModalitySchema = z.enum([
  "text",
  "image",
  "audio",
  "video",
  "pdf",
]);
const tokenLimitSchema = z.number().int().nonnegative();
const priceSchema = z.number().nonnegative();

/** Optional provider model metadata shared by configuration and discovery contracts. */
export const ModelMetadataSchema = z
  .object({
    name: z.string().optional(),
    family: z.string().optional(),
    contextWindow: tokenLimitSchema.optional(),
    maxInputTokens: tokenLimitSchema.optional(),
    maxOutputTokens: tokenLimitSchema.optional(),
    knowledgeCutoff: z.string().optional(),
    releaseDate: z.string().optional(),
    lastUpdated: z.string().optional(),
    status: z.enum(["alpha", "beta", "deprecated"]).optional(),
    modalities: z
      .object({
        input: z.array(ModalitySchema).readonly().optional(),
        output: z.array(ModalitySchema).readonly().optional(),
      })
      .strict()
      .optional(),
    capabilities: z
      .object({
        tools: z.boolean().optional(),
        reasoning: z.boolean().optional(),
        vision: z.boolean().optional(),
        attachment: z.boolean().optional(),
        structuredOutput: z.boolean().optional(),
        teeAttestation: z.boolean().optional(),
        e2ee: z.boolean().optional(),
      })
      .strict()
      .optional(),
    cost: z
      .object({
        input: priceSchema.optional(),
        output: priceSchema.optional(),
        reasoning: priceSchema.optional(),
        cacheRead: priceSchema.optional(),
        cacheWrite: priceSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Sources contributing a model ID; these do not establish account access. */
export const ModelSourceSchema = z.enum(["provider", "models.dev", "user"]);
/** A model in one provider's resolved catalog. */
export const ModelInfoSchema = z
  .object({
    id: z.string().min(1),
    sources: z.array(ModelSourceSchema).min(1).readonly(),
    metadata: ModelMetadataSchema,
  })
  .strict();
/** Ownership of the effective provider definition. */
export const ProviderOriginSchema = z.enum([
  "builtin",
  "catalog",
  "registered",
  "user",
]);
/** Secret-free resolved provider catalog shared by core and daemon clients. */
export const ProviderInfoSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    origin: ProviderOriginSchema,
    credentialType: z.enum(["api", "oauth", "custom", "none"]),
    authStatus: z.enum(["none", "configured"]),
    models: z.array(ModelInfoSchema).readonly(),
  })
  .strict();
