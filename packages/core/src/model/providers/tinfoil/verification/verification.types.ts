import type { TinfoilPrivacyOptions } from "../tinfoil.types";
import type {
  PrivacyDiagnostic,
  PrivacyLimits,
} from "../../../privacy/privacy.types";

/** Inputs for independently verified V3 evidence acquisition. @internal */
export interface TinfoilVerificationOptions extends TinfoilPrivacyOptions {
  readonly signal: AbortSignal;
  readonly limits: PrivacyLimits;
  readonly onDiagnostic?: (diagnostic: PrivacyDiagnostic) => void;
  readonly onFailure?: (reason: string) => void;
}
