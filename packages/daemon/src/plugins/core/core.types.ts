import type { listProviders } from "@comma-agents/core";
import type { Plugin } from "../../daemon-plugin";
import type { CoreProviders } from "./providers";

/** Provider discovery options shared with the core library. */
export type CoreProviderListOptions = NonNullable<
  Parameters<typeof listProviders>[1]
>;

/** Thin aggregation of core provider APIs and typed daemon bindings. */
export interface CorePlugin extends Plugin<"core"> {
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
