import type {
  PrivacyLimits,
  PrivacyRequirements,
  PrivacyResolutionOptions,
  PrivacyEvent,
} from "../../privacy/privacy.types";
import type { TinfoilPrivacyOptions } from "../tinfoil/tinfoil.types";
import type { VenicePrivacyOptions } from "../venice/venice.types";

/** Verification settings for built-in protected providers. */
export interface ProtectedProviderOptions {
  /** Provider-specific verification settings. */
  readonly providers?: {
    /** Tinfoil V3 workload release, register pins, and freshness policy. */
    readonly tinfoil?: TinfoilPrivacyOptions;
    /** Venice hardware verification services and approved serving-stack profiles. */
    readonly venice?: VenicePrivacyOptions;
  };
  /** Legacy Venice setting. Use providers.venice.pccsURL for new configurations. */
  readonly pccsURL?: VenicePrivacyOptions["pccsURL"];
  /** Legacy Venice setting. Use providers.venice.nrasURL for new configurations. */
  readonly nrasURL?: VenicePrivacyOptions["nrasURL"];
  /** Legacy Venice profiles. Use providers.venice.trustedWorkloads for new configurations. */
  readonly trustedWorkloads?: VenicePrivacyOptions["trustedWorkloads"];
}

/** Shared inputs for a code-owned protected transport. @internal */
export interface ProtectedModelOptions extends PrivacyResolutionOptions {
  readonly modelId: string;
  readonly apiKey: string;
  readonly requirements: PrivacyRequirements;
  readonly limits: PrivacyLimits;
  readonly onEvent?: (event: PrivacyEvent) => void;
}
