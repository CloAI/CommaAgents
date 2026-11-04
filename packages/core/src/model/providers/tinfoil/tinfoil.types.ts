import type { ProtectedModelOptions } from "../protected/protected.types";

/** Optional additional register pins, enforced alongside signed V3 workload/platform policy. The current verifier supports AMD Genoa release-profile evidence; other hardware rejects. */
export type TinfoilMeasurementPins =
  | {
      /** Attested hardware platform. */
      readonly type: "sev-snp";
      /** Optional 48-byte SEV-SNP launch measurement, encoded as hexadecimal. */
      readonly launch?: string;
    }
  | {
      /** Attested hardware platform. */
      readonly type: "tdx";
      /** Optional 48-byte launch measurement, encoded as hexadecimal. */
      readonly mrtd?: string;
      /** Optional 48-byte runtime measurement, encoded as hexadecimal. */
      readonly rtmr0?: string;
      /** Optional 48-byte runtime measurement, encoded as hexadecimal. */
      readonly rtmr1?: string;
      /** Optional 48-byte runtime measurement, encoded as hexadecimal. */
      readonly rtmr2?: string;
      /** Optional 48-byte runtime measurement, encoded as hexadecimal. */
      readonly rtmr3?: string;
    };

/** Application-owned Tinfoil V3 workload approval and freshness policy. */
export interface TinfoilPrivacyOptions {
  /** Trusted repository release reference, optionally pinned to a tag and/or sha256 digest. @default "tinfoilsh/confidential-model-router" */
  readonly reference?: string;
  /** Additional AMD launch or Intel TDX measurement pins; observations are never approved automatically. */
  readonly pinnedRegisters?: TinfoilMeasurementPins;
  /** Maximum signed witness age in milliseconds, between 1 and seven days. @default 604800000 */
  readonly freshnessMaxAgeMs?: number;
}

/** Trusted configuration for the provider-owned V3 transport. @internal */
export interface TinfoilProtectedOptions
  extends ProtectedModelOptions, TinfoilPrivacyOptions {}
