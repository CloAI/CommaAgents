import { VERIFICATION_VISIBLE_QUERY_PARAMS } from "../venice.constants";
import { createHash, timingSafeEqual } from "node:crypto";
import type { VerificationContext } from "./verification.types";
import {
  assertPrivacyActive,
  privacyError,
  readPrivacyBody,
  fetchPrivacyBytes,
} from "../../../privacy/privacy.utils";

/** Read a verification response while enforcing cancellation and a byte budget.
 * @param {Response} response - Verification response whose body is consumed.
 * @param {VerificationContext} context - Cancellation and byte budget.
 * @returns {Promise<Uint8Array>} Bounded response bytes.
 */
export async function readVerificationResponse(
  response: Response,
  { signal, maxEvidenceBytes }: VerificationContext,
): Promise<Uint8Array> {
  assertPrivacyActive(signal);
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw privacyError("PRIVACY_PROVIDER_ERROR");
  }
  return readPrivacyBody(response, maxEvidenceBytes, signal);
}

/** Fetch from a runtime-configured verifier without following redirects.
 * @param {string} url - Trusted service address.
 * @param {VerificationContext} context - HTTP implementation and request limits.
 * @param {RequestInit} [options] - Request method, headers, and body.
 * @returns {Promise<object>} Response metadata and bounded bytes.
 */
export async function fetchVerificationResponse(
  url: string,
  context: VerificationContext,
  options?: Pick<RequestInit, "method" | "body" | "headers">,
): Promise<{ readonly response: Response; readonly bytes: Uint8Array }> {
  const signal =
    context.verificationTimeoutMs === undefined
      ? context.signal
      : AbortSignal.any([
          context.signal,
          AbortSignal.timeout(context.verificationTimeoutMs),
        ]);
  return fetchPrivacyBytes(url, options ?? {}, {
    fetch: context.fetch,
    signal,
    maxBytes: context.maxEvidenceBytes,
    operation: "verification-http",
    visibleQueryParams: VERIFICATION_VISIBLE_QUERY_PARAMS,
    onDiagnostic: context.onDiagnostic,
  });
}

/** Compare binary claims without data-dependent early exits.
 * @param {Uint8Array} left - First claim.
 * @param {Uint8Array} right - Second claim.
 * @returns {boolean} Whether the claims match.
 */
export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Hash a claim or token using SHA-256.
 * @param {Uint8Array | string} input - Claim bytes or token text.
 * @returns {Uint8Array} SHA-256 digest.
 */
export function sha256Bytes(input: Uint8Array | string): Uint8Array {
  return createHash("sha256").update(input).digest();
}

/** Validate verifier addresses before appending fixed service paths.
 * @param {string} address - Runtime-selected verifier address.
 * @returns {string} Trusted HTTPS origin.
 */
export function verifierOrigin(address: string): string {
  const url = new URL(address);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid hardware verification service address.");
  }
  return url.origin;
}

/** Decode strictly hexadecimal claims, rejecting truncated and ambiguous input.
 * @param {string} value - Hexadecimal claim.
 * @returns {Uint8Array} Decoded claim bytes.
 */
export function decodeHex(value: string): Uint8Array {
  const normalized = value.replace(/^0x/, "");
  if (
    normalized.length === 0 ||
    normalized.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(normalized)
  ) {
    throw new Error("Malformed hardware verification claim.");
  }
  return Buffer.from(normalized, "hex");
}
