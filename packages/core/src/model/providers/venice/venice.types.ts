import type {
  PrivacyLimits,
  PrivacyRequirements,
  PrivacyResolutionOptions,
  PrivacyRuntimeOptions,
} from "../../privacy/privacy.types";

/** Internal configuration supplied only by the trusted privacy runtime. */
export interface VeniceProtectedOptions extends PrivacyResolutionOptions {
  readonly modelId: string;
  readonly apiKey: string;
  readonly requirements: PrivacyRequirements;
  readonly limits: PrivacyLimits;
  readonly pccsURL: string;
  readonly nrasURL: string;
  readonly onEvent?: PrivacyRuntimeOptions["onEvent"];
}

/** Attestation fields actually used by the Venice transport. */
export interface VeniceAttestation {
  readonly model: string;
  readonly nonce: string;
  readonly intel_quote: string;
  readonly signing_key?: string;
  readonly signing_public_key?: string;
  readonly nvidia_payload?: unknown;
  readonly upstream_model?: string;
}
