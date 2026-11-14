import type { ProviderInfo } from "@comma-agents/core";
import type { NotifyingPlugin } from "../../daemon-plugin";
import type { CoreProviders } from "./providers";

/** The current provider list and whether provider APIs are being called. */
export interface ProvidersSnapshot {
  /** Every known provider with its models.dev, provider-listed, and manual models. */
  readonly providers: readonly ProviderInfo[];
  /** Whether a refresh is calling provider APIs. */
  readonly refreshing: boolean;
}

/** Notifications emitted when the provider list changes. */
export interface CoreNotifications {
  readonly providers_updated: {
    readonly type: "providers_updated";
    readonly snapshot: ProvidersSnapshot;
  };
  /** The configured model roles changed; subscribers read them from the plugin. */
  readonly model_roles_updated: { readonly type: "model_roles_updated" };
}

/** Thin aggregation of core provider APIs and typed daemon bindings. */
export interface CorePlugin extends NotifyingPlugin<"core", CoreNotifications> {
  /** Core-owned provider configuration, credential, verification, and query operations. */
  readonly providers: CoreProviders;
  /** User-configured models for `@role` references. */
  getModelRoles(): Readonly<Record<string, string>>;
  /** Replace the configured roles, saving them before they take effect. */
  setModelRoles(modelRoles: Readonly<Record<string, string>>): void;
}

/** Settings for the core plugin. */
export interface CreateCorePluginOptions {
  /** User-configured models for `@role` references. @default {} */
  readonly modelRoles?: Readonly<Record<string, string>>;
  /** Saves roles before {@link CorePlugin.setModelRoles} applies them. @default no persistence */
  readonly persistModelRoles?: (
    modelRoles: Readonly<Record<string, string>>,
  ) => void;
}
