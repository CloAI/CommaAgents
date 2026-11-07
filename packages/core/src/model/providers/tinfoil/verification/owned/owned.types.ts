import type { TinfoilPrivacyOptions } from "../../tinfoil.types";

/** Independently authenticated transport identity and measured workload. @internal */
export interface TinfoilVerification {
  readonly configRepo: string;
  readonly codeDigest: string;
  readonly codeTag: string;
  readonly gpuCount: number;
  readonly enclaveMeasurement: Readonly<Record<string, string>>;
  readonly freshnessExpiresAt: Date;
  readonly platform?: { readonly digest: string };
  readonly runtime?: { readonly digest: string };
  readonly config?: { readonly digest: string };
  hpkePublicKey(): string | undefined;
}

/** Trusted expectations sampled once for a complete V3 appraisal. @internal */
export interface TinfoilAppraisal extends TinfoilPrivacyOptions {
  readonly nonce: Uint8Array;
  readonly verificationTime: Date;
  /** Router proofs must be CPU-only; model proofs must bind the declared GPU count. */
  readonly profile?: "router" | "model";
}

/** Parsed workload release constraint. @internal */
export interface TinfoilReference {
  readonly repo: string;
  readonly tag?: string;
  readonly digest?: string;
}

/** DER node preserving exact signed bytes. @internal */
export interface DerNode {
  readonly tag: number;
  readonly bytes: Uint8Array;
  readonly value: Uint8Array;
  readonly children: readonly DerNode[];
}

/** Native X.509 certificate with strictly parsed extension and name encodings. @internal */
export interface TinfoilCertificate {
  readonly certificate: import("node:crypto").X509Certificate;
  readonly issuer: Uint8Array;
  readonly subject: Uint8Array;
  readonly extensions: ReadonlyMap<
    string,
    { readonly critical: boolean; readonly value: Uint8Array }
  >;
}

/** Sigstore-authenticated release and its signed in-toto statement. @internal */
export interface TinfoilSignedRelease {
  readonly repo: string;
  readonly tag: string;
  readonly digest: string;
  readonly commit: string;
  readonly loggedAt: number;
  readonly statement: {
    readonly subject: readonly {
      readonly name: string;
      readonly digest: { readonly sha256: string };
    }[];
    readonly predicateType: string;
    readonly predicate: Readonly<Record<string, unknown>>;
  };
}

/** Independently authenticated Intel TDX evidence before policy appraisal. @internal */
export interface TinfoilIntelQuote {
  readonly identity: string;
  readonly report: import("@phala/dcap-qvl").TDReport10;
  readonly quote: import("@phala/dcap-qvl").Quote;
  readonly tcbEvaluationDataNumber: number;
  readonly expiresAt: number;
}

/** Inputs already bound by the V3 envelope and authenticated release provenance. @internal */
export interface TinfoilCpuAppraisal {
  readonly document: import("zod").infer<
    typeof import("./owned.schemas").documentSchema
  >;
  readonly report: Uint8Array;
  readonly reportData: Uint8Array;
  readonly platform: Readonly<Record<string, unknown>>;
  readonly workload: Readonly<Record<string, unknown>>;
  readonly time: number;
}
/** CPU-authenticated measurements and collateral validity after full policy appraisal. @internal */
export interface TinfoilCpuVerification {
  readonly measurements: Readonly<Record<string, string>>;
  readonly expiresAt: number;
}
