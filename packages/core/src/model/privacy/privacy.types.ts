import type { LanguageModel } from "ai";
import type { ProtectedProviderOptions } from "../providers/protected/protected.types";
import type {
  VeniceWorkloadMeasurements,
  VeniceWorkloadPolicy,
} from "../providers/venice/venice.types";

/** Minimum protections, augmented automatically by the selected model’s advertised TEE/E2EE support. */
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
  | "PRIVACY_MEASUREMENTS_UNAVAILABLE"
  | "PRIVACY_MEASUREMENTS_INVALID"
  | "PRIVACY_WORKLOAD_UNTRUSTED"
  | "PRIVACY_GPU_EVIDENCE_UNAVAILABLE"
  | "PRIVACY_RESPONSE_AUTHENTICATION_FAILED"
  | "PRIVACY_INVALID_RESPONSE"
  | "PRIVACY_LIMIT_EXCEEDED"
  | "PRIVACY_TIMEOUT"
  | "PRIVACY_CANCELLED"
  | "PRIVACY_CALLBACK_FAILED"
  | "PRIVACY_PROVIDER_ERROR";

/** A safe protection error, without raw causes or transport payloads. */
export type PrivacyError = Error & { readonly code: PrivacyErrorCode };

/** Compatibility name for Venice's authenticated serving-stack measurements. */
export type PrivacyWorkloadMeasurements = VeniceWorkloadMeasurements;

/** Compatibility name for Venice's approved serving-stack profile. */
export type PrivacyWorkloadPolicy = VeniceWorkloadPolicy;

/** Content-free comparison against every approved profile when no workload profile matches. */
export interface PrivacyWorkloadMismatch {
  /** Distinguishes missing approval from differing authenticated measurements. */
  readonly reason: "no-approved-profiles" | "measurement-mismatch";
  /** Differences kept separate for each candidate; a match must satisfy one complete profile. */
  readonly profiles: readonly {
    /** Zero-based index in the selected model's approved profile array. */
    readonly profileIndex: number;
    /** Only fields that differ; null means the value is absent from that side. */
    readonly differences: readonly {
      /** Profile measurement field that differs. */
      readonly field: string;
      /** Approved value, or null if the optional field was not pinned. */
      readonly expected: string | null;
      /** Authenticated observed value, or null if the optional measurement is absent. */
      readonly actual: string | null;
    }[];
  }[];
}

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
  /** Aggregate outcome; degraded output was released under an explicit exception with unmet binding guarantees. */
  readonly status: "verified" | "degraded" | "rejected";
  /** ISO timestamp when this upstream request started. */
  readonly startedAt: string;
  /** ISO timestamp when verification completed or rejected. */
  readonly checkedAt: string;
  /** Independent check outcomes; passed components remain visible after later rejection. */
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
  /** Authenticated expiry for V3 evidence; requests must reverify before this time. */
  readonly freshnessExpiresAt?: string;
  /** Provider verification step outcomes; excludes raw evidence and upstream error text. */
  readonly verificationSteps?: Readonly<Record<string, PrivacyCheckStatus>>;
  /** Independent provider receipt checks; passed signatures do not imply body binding. */
  readonly receiptChecks?: Readonly<Record<string, PrivacyCheckStatus>>;
  /** Authenticated software measurements, even when no trusted policy approves them. */
  readonly workloadMeasurements?: Readonly<Record<string, string | undefined>>;
  /** Per-profile expected and actual measurement differences when workload approval rejects. */
  readonly workloadMismatch?: PrivacyWorkloadMismatch;
  /** Source of CPU/GPU association; this does not prove physical co-location independently of the serving software. */
  readonly gpuAssociation?: "approved-workload" | "router-admitted-enclave";
  /** Direct NVIDIA report appraisal for every admitted candidate; model CPU identities are vouched for by the attested router. */
  readonly downstreamVerification?: {
    readonly scope: "router-admitted-pool";
    readonly identitySource: "attested-router";
    readonly modelRepository: string;
    readonly enclaveCount: number;
    readonly gpuCount: number;
  };
}

/** Bounded provider error metadata; arbitrary messages and response bodies are omitted. */
export interface PrivacyProviderError {
  /** Provider's structured error code, when safe to display. */
  readonly code?: string;
  /** Provider's structured error type, when safe to display. */
  readonly type?: string;
  /** Invalid protocol parameter, when identifiable without exposing values. */
  readonly param?: string;
  /** Recognized validation message, normalized to exclude echoed values. */
  readonly message: string;
  /** True when the original message could not be safely retained. */
  readonly messageRedacted: boolean;
  /** Structured validation issue codes and field paths; echoed input values are excluded. */
  readonly validation?: readonly {
    readonly code?: string;
    readonly param?: string;
  }[];
}

/** Safe diagnostics for one network operation or hardware check. */
export interface PrivacyDiagnostic {
  /** Operation within the upstream request. */
  readonly operation:
    | "attestation"
    | "verification-http"
    | "cpu-verification"
    | "gpu-verification"
    | "hardware-binding"
    | "compose-manager-verification"
    | "workload-measurements"
    | "workload-verification"
    | "inference"
    | "response-decoding"
    | "response-signature";
  /** Whether the operation started, completed, or failed. */
  readonly status: "started" | "succeeded" | "failed";
  /** Endpoint origin and pathname; query strings and credentials are excluded. */
  readonly endpoint?: string;
  /** Application-supplied header names and safe values; credentials and unknown values are redacted. */
  readonly requestHeaders?: Readonly<Record<string, string>>;
  /** All query parameter names, preserving repeated values; unknown values are redacted. */
  readonly queryParams?: Readonly<Record<string, readonly string[]>>;
  /** HTTP method, when the operation makes a network request. */
  readonly method?: string;
  /** Whether an Authorization header was supplied; never its value. */
  readonly authenticated?: boolean;
  /** HTTP response status, when headers were received. */
  readonly httpStatus?: number;
  /** Selected provider error metadata, never the raw HTTP error body. */
  readonly providerError?: PrivacyProviderError;
  /** Elapsed time through response body consumption or verification. */
  readonly durationMs?: number;
  /** Sanitized operation failure. */
  readonly errorCode?: PrivacyErrorCode;
  /** Failure source, without the underlying exception text. */
  readonly failure?:
    | "http"
    | "network"
    | "timeout"
    | "cancelled"
    | "response"
    | "verification";
  /** Provider-defined, code-owned failure category, without response content or input values. */
  readonly failureReason?: string;
  /** Provider verification step outcomes without raw SDK errors. */
  readonly verificationSteps?: Readonly<Record<string, PrivacyCheckStatus>>;
  /** Authenticated software hashes; contains no manifest, evidence, or keys. */
  readonly measurements?: Readonly<Record<string, string | undefined>>;
  /** Per-profile expected and actual measurement differences for rejected workload approval. */
  readonly workloadMismatch?: PrivacyWorkloadMismatch;
  /** Allowlisted transport error code, without hostnames or exception messages. */
  readonly transportCode?: string;
}

/** Internal ownership and diagnostics for a bounded HTTP operation. @internal */
export interface PrivacyRequestContext {
  readonly fetch: typeof globalThis.fetch;
  readonly signal: AbortSignal;
  readonly maxBytes: number;
  readonly operation: PrivacyDiagnostic["operation"];
  /** Adapter-owned public header names; values of unknown headers remain redacted. */
  readonly visibleHeaders?: ReadonlySet<string>;
  /** Adapter-owned public query fields; values of unknown parameters remain redacted. */
  readonly visibleQueryParams?: ReadonlySet<string>;
  readonly onDiagnostic?: (diagnostic: PrivacyDiagnostic) => void;
}

/** Verification progress; excludes content, private keys, credentials, and raw evidence. */
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
    | "degraded"
    | "rejected";
  readonly report?: PrivacyReport;
  /** Safe details of an individual network operation or verification check. */
  readonly diagnostic?: PrivacyDiagnostic;
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
export interface PrivacyRuntimeOptions extends ProtectedProviderOptions {
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
