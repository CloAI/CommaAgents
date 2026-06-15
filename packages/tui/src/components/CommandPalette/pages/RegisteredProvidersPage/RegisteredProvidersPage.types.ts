import type { DaemonMessageOf } from "../../../../hooks/useDaemon/useDaemon.types";

/** Type for a provider extracted from the daemon's provider list. */
export type ProviderInfo = DaemonMessageOf<"provider_list">["providers"][number];

/** Represents the current view state of the Registered Providers page. */
export type RegisteredProvidersViewState =
  | { readonly kind: "list" }
  | {
      readonly kind: "api-input";
      readonly provider: ProviderInfo;
    }
  | {
      readonly kind: "oauth-confirm";
      readonly provider: ProviderInfo;
    };
