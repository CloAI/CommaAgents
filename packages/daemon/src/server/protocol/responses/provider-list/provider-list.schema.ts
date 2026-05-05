// Daemon → Client: provider_list
// Response to a list_providers request.

import { z } from "zod";
import { DaemonBase } from "../../shared";

/** Supported modality identifiers mirrored from the models.dev catalog. */
export const ModalitySchema = z.enum(["text", "image", "audio", "video", "pdf"]);

/** Release status for a model, when known. */
export const ModelStatusSchema = z.enum(["alpha", "beta", "deprecated"]);

/** Provenance of the model list for a provider. */
export const ModelsSourceSchema = z.enum(["catalog", "live", "merged", "error"]);

/** Normalized model metadata sent over the wire. */
export const ModelInfoSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  family: z.string().optional(),
  contextWindow: z.number().optional(),
  maxInputTokens: z.number().optional(),
  maxOutputTokens: z.number().optional(),
  knowledgeCutoff: z.string().optional(),
  releaseDate: z.string().optional(),
  lastUpdated: z.string().optional(),
  status: ModelStatusSchema.optional(),
  modalities: z
    .object({
      input: z.array(ModalitySchema).optional(),
      output: z.array(ModalitySchema).optional(),
    })
    .optional(),
  capabilities: z
    .object({
      tools: z.boolean().optional(),
      reasoning: z.boolean().optional(),
      vision: z.boolean().optional(),
      attachment: z.boolean().optional(),
      structuredOutput: z.boolean().optional(),
    })
    .optional(),
  cost: z
    .object({
      input: z.number().optional(),
      output: z.number().optional(),
      reasoning: z.number().optional(),
      cacheRead: z.number().optional(),
      cacheWrite: z.number().optional(),
    })
    .optional(),
});

export type ModelInfoWire = z.infer<typeof ModelInfoSchema>;

/** Per-provider discovery metadata sent in `provider_list` responses. */
export const ProviderInfoSchema = z.object({
  /** Canonical provider id (matches models.dev keys, e.g., "openai", "github-copilot"). */
  id: z.string(),
  /** Human-friendly display name (catalog `name` when available). */
  name: z.string(),
  /**
   * Configuration-level auth status. `"configured"` means a credential
   * is resolvable (env var, strategy scope, or global scope). Not
   * validated against the provider's API.
   */
  authStatus: z.enum(["none", "configured"]),
  /** Normalized model metadata. Empty array when nothing is known. */
  models: z.array(ModelInfoSchema),
  /** Provenance of the models list. */
  modelsSource: ModelsSourceSchema,
  /** ISO timestamp when live data was fetched, if any. */
  fetchedAt: z.string().optional(),
  /** Error message when live discovery failed and we fell back to catalog. */
  error: z.string().optional(),
  /** `true` if the provider was added via `registerProvider()`. */
  isCustom: z.boolean(),
});

export type ProviderInfoWire = z.infer<typeof ProviderInfoSchema>;

export const ProviderListMessage = DaemonBase.extend({
  type: z.literal("provider_list"),
  /** Alphabetically sorted list of known providers. */
  providers: z.array(ProviderInfoSchema),
});

export type ProviderListMessage = z.infer<typeof ProviderListMessage>;
