import type { z } from "zod/v4";
import type {
  CustomProviderSettingsSchema,
  ProviderSettingsSchema,
  AddCustomProviderArgumentsSchema,
  UpdateCustomProviderArgumentsSchema,
  ProviderConfigurationSchema,
  CustomModelSettingsSchema,
  AddCustomProviderModelArgumentsSchema,
} from "./settings.schemas";

/** Persisted custom endpoint configuration. */
export type CustomProviderSettings = z.output<
  typeof CustomProviderSettingsSchema
>;
/** Versioned user settings; credentials are stored separately. */
export type ProviderSettings = z.output<typeof ProviderSettingsSchema>;
/** Options for creating a custom compatible endpoint. */
export type AddCustomProviderOptions = Readonly<
  Omit<z.input<typeof AddCustomProviderArgumentsSchema>, "models">
> & { readonly models?: readonly CustomModelSettings[] };
/** Editable endpoint fields; the provider identity is immutable. */
export type UpdateCustomProviderOptions = Readonly<
  z.input<typeof UpdateCustomProviderArgumentsSchema>
>;
/** Secret-free provider and credential configuration. */
export type ProviderConfiguration = Readonly<
  z.output<typeof ProviderConfigurationSchema>
>;

/** Persisted user model with optional display, capability, limit, and pricing metadata. */
export type CustomModelSettings = z.output<typeof CustomModelSettingsSchema>;
/** Input for an additive provider-local model registration. */
export type AddCustomProviderModelOptions = Readonly<
  z.input<typeof AddCustomProviderModelArgumentsSchema>
>;
