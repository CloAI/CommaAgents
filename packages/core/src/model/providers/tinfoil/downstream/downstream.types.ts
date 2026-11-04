import type { PrivacyDiagnostic, PrivacyLimits, PrivacyReport } from "../../../privacy/privacy.types";
import type { TinfoilVerification } from "../verification/owned/owned.types";

/** Inputs for GPU verification through router-admitted enclave identities. @internal */
export interface TinfoilDownstreamOptions {
  readonly modelId:string;
  readonly router:TinfoilVerification;
  readonly signal:AbortSignal;
  readonly limits:PrivacyLimits;
  readonly freshnessMaxAgeMs?:number;
  readonly onDiagnostic?:(diagnostic:PrivacyDiagnostic)=>void;
}
/** Pool-wide GPU appraisal; model CPU identity is authenticated through the verified router. @internal */
export interface TinfoilDownstreamAudit {
  readonly expiresAt:number;
  readonly poolDigest:string;
  readonly report:NonNullable<PrivacyReport["downstreamVerification"]>;
  assertCurrentPool():Promise<void>;
}
/** Authenticated model enclave admission, never an arbitrary endpoint from an HTTP header. @internal */
export interface TinfoilAdmittedEnclave {
  readonly hostname:string;
  readonly hpkeKey:string;
  readonly tlsKey:string;
  readonly predicate:string;
  readonly codeTag:string;
  readonly expiresAt:number;
}
/** Selected model admission data authenticated by a request-specific router encryption context. @internal */
export interface TinfoilAdmittedPool {
  readonly repo:string;
  readonly enclaves:readonly TinfoilAdmittedEnclave[];
  readonly digest:string;
}
