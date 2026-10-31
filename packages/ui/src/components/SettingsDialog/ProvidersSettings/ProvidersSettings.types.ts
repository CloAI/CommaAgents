export type {
  DiscoveredModel,
  DiscoveredProvider,
  ModelCapability,
  ProviderVerification,
} from "../../ModelBrowser/ModelBrowser.types";
import type {
  DiscoveredProvider,
  ProviderVerification,
} from "../../ModelBrowser/ModelBrowser.types";

/** Credential/endpoint changes invalidate the previous displayed check. */
export interface ProviderSettingsChange {
  readonly providerId: string;
  readonly verification?: ProviderVerification;
}
/** At most one provider workflow appears above the Settings modal. */
export type ProviderDialog =
  | { readonly type: "model"; readonly providerId?: string }
  | { readonly type: "configuration"; readonly provider: DiscoveredProvider }
  | { readonly type: "custom"; readonly provider?: DiscoveredProvider }
  | {
      readonly type: "removeModel";
      readonly provider: DiscoveredProvider;
      readonly modelId: string;
    };
