import type { PrivacyLimits } from "./privacy.types";

export const DEFAULT_PRIVACY_LIMITS: PrivacyLimits = {
  requestTimeoutMs: 120_000,
  verificationTimeoutMs: 15_000,
  maxEvidenceBytes: 2 * 1024 * 1024,
  maxWireBytes: 64 * 1024 * 1024,
  maxPlaintextBytes: 16 * 1024 * 1024,
};
/** Public request metadata whose values can be included in privacy diagnostics. */
export const PRIVACY_VISIBLE_HEADERS = new Set([
  "accept",
  "content-type",
  "content-length",
  "user-agent",
]);

/** Error diagnostics never buffer more than this many response bytes. */
export const PRIVACY_ERROR_BODY_LIMIT = 16 * 1024;
/** A stalled error body must not delay reporting the original HTTP failure. */
export const PRIVACY_ERROR_BODY_TIMEOUT_MS = 2000;
