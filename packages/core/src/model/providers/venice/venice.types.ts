import type { ProtectedModelOptions } from "../protected/protected.types";
import type { PrivacyCheckStatus } from "../../privacy/privacy.types";

/** Independently evaluated properties of a Venice completion receipt. @internal */
export type VeniceReceiptChecks = {
  readonly completionId: PrivacyCheckStatus;
  readonly signature: PrivacyCheckStatus;
  readonly model: PrivacyCheckStatus;
  readonly requestBody: PrivacyCheckStatus;
  readonly responseBody: PrivacyCheckStatus;
};

/** Internal configuration supplied only by the trusted privacy runtime. */
export interface VeniceProtectedOptions extends ProtectedModelOptions {
  readonly pccsURL: string;
  readonly nrasURL: string;
  readonly trustedWorkloads?: VenicePrivacyOptions["trustedWorkloads"];
  readonly allowUnboundReceipts?: boolean;
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
  readonly event_log?: unknown;
  readonly info?: { readonly tcb_info?: unknown };
  readonly compose_manager_attestation?: unknown;
}

/** Request fields folded into encrypted message text before transport. @internal */
export interface VeniceToolRequest {
  messages: { role: string; content?: unknown; [key: string]: unknown }[];
  [key: string]: unknown;
}

/** Tool selection policy retained locally while the encrypted response is buffered. @internal */
export interface VeniceToolPolicy {
  readonly names: readonly string[];
  readonly required: boolean;
  readonly parallel: boolean;
  /** Declared top-level input fields; used only to normalize unambiguous flattened tool envelopes. */
  readonly parameterNames?: Readonly<Record<string, readonly string[]>>;
}

/** Content-free classification of rejected encrypted tool-call text. @internal */
export type VeniceToolDecodeFailure =
  | "invalid-tool-envelope"
  | "invalid-tool-json"
  | "invalid-tool-schema"
  | "unoffered-tool"
  | "tool-selection-violation";

/** Authenticated software identity; identifying software does not approve it. */
export type VeniceWorkloadMeasurements = {
  /** Hardware-authenticated initial TDX measurement. */
  readonly mrTd: string;
  /** Hardware-authenticated boot measurements. */
  readonly rtMr0: string;
  readonly rtMr1: string;
  readonly rtMr2: string;
  /** Hardware-authenticated runtime measurement, verified against the event log. */
  readonly rtMr3: string;
  /** Application identity recorded in the authenticated launch log. */
  readonly appId: string;
  /** SHA-256 of the exact measured key-provider descriptor; approval pins this trust dependency. */
  readonly keyProviderHash: string;
  /** Hash of the exact app-compose bytes, bound into MR_CONFIG_ID and RTMR3. */
  readonly composeHash: string;
  /** OS image identity recorded before system-ready; approval also requires boot measurements. */
  readonly osImageHash: string;
  /** Hash of separately authenticated runtime deployment actions, when present. */
  readonly composeManagerActionsHash?: string;
};

/**
 * Explicitly approved serving-stack measurements supplied by the application.
 * Approval trusts this stack to enforce the protected GPU channel and retain private keys;
 * it does not assert physical CPU/GPU co-location or particular model weights.
 * Obtain reference values independently; never approve a profile merely because the server returned it.
 */
export interface VeniceWorkloadPolicy {
  /** Expected firmware/initial guest measurement (48-byte hex). */
  readonly mrTd: string;
  /** Expected first boot measurement register (48-byte hex). */
  readonly rtMr0: string;
  /** Expected second boot measurement register (48-byte hex). */
  readonly rtMr1: string;
  /** Expected third boot measurement register (48-byte hex). */
  readonly rtMr2: string;
  /** Expected application identity from the authenticated launch log. */
  readonly appId: string;
  /** SHA-256 of the independently approved key-provider descriptor. */
  readonly keyProviderHash: string;
  /** SHA-256 of the exact reviewed application manifest. */
  readonly composeHash: string;
  /** Expected OS image identity, approved together with the boot measurements. */
  readonly osImageHash: string;
  /** Required whenever a compose-manager attestation is supplied. */
  readonly composeManagerActionsHash?: string;
}

/** Trusted verification configuration for Venice protected inference. */
export interface VenicePrivacyOptions {
  /** Continue on body-hash mismatches only after authenticating the receipt identity and signature. Exact conversation integrity remains unverified. @default false */
  readonly allowUnboundReceipts?: boolean;
  /** HTTPS Intel-collateral service. Defaults to Phala's PCCS. */
  readonly pccsURL?: string;
  /** HTTPS NVIDIA attestation service. Defaults to NVIDIA NRAS. */
  readonly nrasURL?: string;
  /** Approved Venice serving-stack profiles keyed by the exact venice/model ID. */
  readonly trustedWorkloads?: Readonly<
    Record<string, readonly VeniceWorkloadPolicy[]>
  >;
}

/** Validated Venice verification settings. @internal */
export interface ResolvedVenicePrivacyOptions {
  readonly allowUnboundReceipts: boolean;
  readonly pccsURL: string;
  readonly nrasURL: string;
  readonly trustedWorkloads: Readonly<
    Record<string, readonly VeniceWorkloadPolicy[]>
  >;
}
