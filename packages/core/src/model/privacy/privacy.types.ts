import type { LanguageModel } from "ai";

/** Required protections. Omit both fields for ordinary inference. */
export interface PrivacyRequirements {
  /** Require independent TEE evidence and authenticated completion binding. */
  readonly tee?: "required";
  /** Require encrypted conversation content in addition to TEE protection. */
  readonly e2ee?: "required";
}

/** Outcome of an individual protection check. */
export type PrivacyCheckStatus =
  | "passed"
  | "failed"
  | "unavailable"
  | "notApplicable";

/** Stable errors that never include provider response bodies or private material. */
export type PrivacyErrorCode =
  | "PRIVACY_CONFIGURATION_ERROR"
  | "PRIVACY_UNSUPPORTED_PROVIDER"
  | "PRIVACY_UNSUPPORTED_MODEL"
  | "PRIVACY_UNSUPPORTED_FEATURE"
  | "PRIVACY_CREDENTIAL_REQUIRED"
  | "PRIVACY_ATTESTATION_FAILED"
  | "PRIVACY_BINDING_UNAVAILABLE"
  | "PRIVACY_RESPONSE_AUTHENTICATION_FAILED"
  | "PRIVACY_INVALID_RESPONSE"
  | "PRIVACY_LIMIT_EXCEEDED"
  | "PRIVACY_TIMEOUT"
  | "PRIVACY_CANCELLED"
  | "PRIVACY_CALLBACK_FAILED"
  | "PRIVACY_PROVIDER_ERROR";

/** A safe protection error, without raw causes or transport payloads. */
export type PrivacyError = Error & { readonly code: PrivacyErrorCode };

/** Content-free record of one upstream inference request. */
export interface PrivacyReport {
  /** UUID for one upstream request, including a summarizer or tool step. */
  readonly requestId: string;
  /** Provider receiving the inference request. */
  readonly providerId: string;
  /** Provider-local model identity selected by the caller. */
  readonly modelId: string;
  /** Requirements enforced for this request. */
  readonly requirements: PrivacyRequirements;
  /** Aggregate outcome; individual passed checks do not imply aggregate success. */
  readonly status: "verified" | "rejected";
  /** ISO timestamp when this upstream request started. */
  readonly startedAt: string;
  /** ISO timestamp when verification completed or rejected. */
  readonly checkedAt: string;
  /** Independent check outcomes; workload approval is not required by this policy. */
  readonly checks: Readonly<
    Record<
      | "cpu"
      | "gpu"
      | "freshness"
      | "keyBinding"
      | "responseBinding"
      | "encryption"
      | "workload",
      PrivacyCheckStatus
    >
  >;
  readonly errorCode?: PrivacyErrorCode;
}

/** Verification progress; never contains content, encryption keys, or raw evidence. */
export interface PrivacyEvent {
  /** UUID shared with the final report. */
  readonly requestId: string;
  /** Provider receiving the inference request. */
  readonly providerId: string;
  /** Provider-local model identity. */
  readonly modelId: string;
  /** Current verification or inference stage. */
  readonly phase:
    | "preflight"
    | "attestation"
    | "inference"
    | "authentication"
    | "verified"
    | "rejected";
  readonly report?: PrivacyReport;
}

/** Runtime bounds for each upstream request, including its verification work. */
export interface PrivacyLimits {
  /** Complete upstream request deadline. @default 120000 */
  readonly requestTimeoutMs: number;
  /** Per-service-operation deadline within the overall deadline. @default 15000 */
  readonly verificationTimeoutMs: number;
  /** Maximum bytes per evidence response. @default 2097152 */
  readonly maxEvidenceBytes: number;
  /** Maximum buffered upstream inference bytes. @default 67108864 */
  readonly maxWireBytes: number;
  /** Maximum decoded completion and outgoing plaintext request bytes. @default 16777216 */
  readonly maxPlaintextBytes: number;
}

/** Trusted application-owned verification configuration, never model-supplied. */
export interface PrivacyRuntimeOptions {
  /** HTTPS Intel-collateral service. Defaults to Phala's PCCS. */
  readonly pccsURL?: string;
  /** HTTPS NVIDIA attestation service. Defaults to NVIDIA NRAS. */
  readonly nrasURL?: string;
  /** Positive integer resource bounds; omitted fields use defaults. */
  readonly limits?: Partial<PrivacyLimits>;
  /** Synchronous observer; exceptions or promises reject the owning request. */
  readonly onEvent?: (event: PrivacyEvent) => void;
}

/** Per-resolution request ownership and report collection. */
export interface PrivacyResolutionOptions {
  /** Cancellation shared with each upstream request made through this model. */
  readonly signal?: AbortSignal;
  /** Synchronous final-outcome observer; exceptions reject the request. */
  readonly onReport?: (report: PrivacyReport) => void;
}

/** Application-owned protected model resolver; no persistent session keys. */
export interface PrivacyRuntime {
  /** Resolve an explicit provider/model through its code-owned protected transport. */
  resolveModel(
    modelString: string,
    requirements: PrivacyRequirements,
    options?: PrivacyResolutionOptions,
  ): Promise<LanguageModel>;
}
