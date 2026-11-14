import { z } from "zod/v4";
import { ModelMetadataSchema } from "../providers.schemas";

/** Provider-local identity; custom provider IDs cannot contain model separators. */
export const CustomProviderIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9_-]*$/);
/** An exact provider-local model ID, including any namespace separators. */
export const CustomModelIdSchema = z.string().trim().min(1);
/** A manually declared model and its optional metadata. */
export const CustomModelSettingsSchema = z
  .object({
    id: CustomModelIdSchema,
    metadata: ModelMetadataSchema.optional(),
  })
  .strict();

/** Complete API prefix without embedded secrets or request parameters. */
export const ProviderBaseURLSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, "Expected an HTTP(S) API prefix without credentials, query, or fragment");
/** Public connection fields for a user-owned endpoint. */
export const CustomProviderDefinitionSchema = z
  .object({
    name: z.string().trim().min(1),
    baseURL: ProviderBaseURLSchema,
    credentialType: z.enum(["api", "none"]),
  })
  .strict();
/** A user-owned endpoint and its manual model declarations. */
export const CustomProviderSettingsSchema = z
  .object({
    kind: z.literal("custom"),
    id: CustomProviderIdSchema,
    definition: CustomProviderDefinitionSchema,
    models: z.array(CustomModelSettingsSchema),
  })
  .strict();
/** Additional models for an existing provider. */
export const ProviderModelSettingsSchema = z
  .object({
    kind: z.literal("existing"),
    id: z.string().trim().min(1),
    models: z.array(CustomModelSettingsSchema),
  })
  .strict();
/** Version 3 configuration only; older schemas are unsupported. */
export const ProviderSettingsSchema = z
  .object({
    version: z.literal(3),
    providers: z.array(
      z.discriminatedUnion("kind", [
        CustomProviderSettingsSchema,
        ProviderModelSettingsSchema,
      ]),
    ),
  })
  .strict()
  .superRefine((settings, context) => {
    const ids = new Set<string>();
    for (const provider of settings.providers) {
      if (ids.has(provider.id)) {
        context.addIssue({ code: "custom", message: "Duplicate provider ID" });
      }
      ids.add(provider.id);
      if (
        new Set(provider.models.map((model) => model.id)).size !==
        provider.models.length
      ) {
        context.addIssue({ code: "custom", message: "Duplicate model ID" });
      }
    }
  });

/** Identity shared by provider configuration operations. */
export const ProviderArgumentsSchema = z
  .object({ providerId: z.string().trim().min(1) })
  .strict();
/** Save a global API key; credential values are input only. */
export const ConfigureProviderArgumentsSchema = ProviderArgumentsSchema.extend({
  apiKey: z.string().trim().min(1),
});
/** Create a compatible endpoint with optional manually declared model IDs. */
export const AddCustomProviderArgumentsSchema =
  CustomProviderDefinitionSchema.extend({
    id: CustomProviderIdSchema,
    models: z.array(CustomModelSettingsSchema).optional(),
  });
/** Update public endpoint fields without changing its identity. */
export const UpdateCustomProviderArgumentsSchema =
  ProviderArgumentsSchema.extend({
    name: CustomProviderDefinitionSchema.shape.name.optional(),
    baseURL: ProviderBaseURLSchema.optional(),
    credentialType:
      CustomProviderDefinitionSchema.shape.credentialType.optional(),
  });
/** Add or remove one exact provider-local model ID, with optional metadata on additions. */
export const CustomProviderModelArgumentsSchema =
  ProviderArgumentsSchema.extend({ modelId: CustomModelIdSchema });
/** Add one model with optional metadata; an existing manual entry is unchanged. */
export const AddCustomProviderModelArgumentsSchema =
  CustomProviderModelArgumentsSchema.extend({
    metadata: ModelMetadataSchema.optional(),
  });
/** Secret-free credential metadata and editable user settings. */
export const ProviderConfigurationSchema = z.object({
  providerId: z.string(),
  authStatus: z.enum(["none", "configured"]),
  hasSavedCredential: z.boolean(),
  authenticationMethod: z
    .enum(["api", "oauth", "custom"])
    .nullable()
    .optional(),
  accountEmail: z.string().optional(),
  credentialSource: z.enum(["none", "environment", "global"]),
  verificationSupported: z.boolean(),
  customProvider: CustomProviderDefinitionSchema.nullable(),
  customModels: z.array(CustomModelSettingsSchema).readonly(),
});
/** Result of removing a persisted custom endpoint. */
export const RemoveCustomProviderOutputSchema = z.object({
  providerId: z.string(),
  removed: z.boolean(),
});
