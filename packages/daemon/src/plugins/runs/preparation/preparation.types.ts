import type { z } from "zod/v4";
import type {
  RunConfigurationSchema,
  NewRunConfigurationSchema,
  RunConfigurationOverridesSchema,
} from "./preparation.schemas";
/** Complete settings used to reload a run. */
export type RunConfiguration = z.infer<typeof RunConfigurationSchema>;
/** Settings for a new conversation; working directory defaults once during preparation. */
export type NewRunConfiguration = z.input<typeof NewRunConfigurationSchema>;
/** Explicit changes to saved settings; null clears an optional override. */
export type RunConfigurationOverrides = z.infer<
  typeof RunConfigurationOverridesSchema
>;
/** Create a conversation with explicit configuration. */
export interface PrepareNewRunOptions {
  readonly runId?: string;
  readonly configuration: NewRunConfiguration;
}
/** Reload an existing conversation with optional setting changes. */
export interface PrepareExistingRunOptions {
  readonly runId: string;
  readonly configuration?: RunConfigurationOverrides;
}
/** Configuration is required for new conversations and restored for existing ones. */
export type PrepareRunOptions =
  | PrepareNewRunOptions
  | PrepareExistingRunOptions;
