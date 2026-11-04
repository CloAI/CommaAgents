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
}

/** Thin aggregation of core provider APIs and typed daemon bindings. */
export interface CorePlugin extends NotifyingPlugin<"core", CoreNotifications> {
  /** Core-owned provider configuration, credential, verification, and query operations. */
  readonly providers: CoreProviders;
  /** User-configured models for `@role` references, used when describing strategies. */
  readonly modelRoles: Readonly<Record<string, string>>;
}

/** Settings for the core plugin. */
export interface CreateCorePluginOptions {
  /** User-configured models for `@role` references. @default {} */
  readonly modelRoles?: Readonly<Record<string, string>>;
}
