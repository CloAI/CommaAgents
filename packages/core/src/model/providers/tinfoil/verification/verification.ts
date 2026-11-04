import { randomBytes } from "node:crypto";
import { tinfoilVerifier } from "./owned/owned";
import { parseTinfoilReference } from "./owned/owned.document";
import type { TinfoilVerification } from "./owned/owned.types";
import type { TinfoilPrivacyOptions } from "../tinfoil.types";
import {
  privacyError,
  assertPrivacyActive,
  fetchPrivacyBytes,
  tracePrivacyCheck,
  sanitizePrivacyError,
} from "../../../privacy/privacy.utils";
import { awaitTinfoilOperation } from "../tinfoil.utils";
import { TINFOIL_CONFIG_REPOSITORY } from "../tinfoil.constants";
import type { TinfoilVerificationOptions } from "./verification.types";

/** Validate application-owned workload constraints before any requests are sent.
 * @param {TinfoilPrivacyOptions} options - Repository/release, measurement, and witness-age constraints.
 * @returns {void} Nothing; invalid policy rejects immediately.
 */
export function validateTinfoilPolicy(options: TinfoilPrivacyOptions): void {
  try {
    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      Object.keys(options).some(
        (key) =>
          !["reference", "pinnedRegisters", "freshnessMaxAgeMs"].includes(key),
      )
    ) {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
    if (
      (options.reference !== undefined &&
        typeof options.reference !== "string") ||
      (options.freshnessMaxAgeMs !== undefined &&
        typeof options.freshnessMaxAgeMs !== "number") ||
      (options.pinnedRegisters !== undefined &&
        (!options.pinnedRegisters ||
          typeof options.pinnedRegisters !== "object" ||
          Array.isArray(options.pinnedRegisters)))
    ) {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
    parseTinfoilReference(options.reference ?? TINFOIL_CONFIG_REPOSITORY);
    const age = options.freshnessMaxAgeMs ?? 604800000;
    if (!Number.isSafeInteger(age) || age <= 0 || age > 604800000) {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
    if (options.pinnedRegisters) {
      const pins = options.pinnedRegisters;
      const fields =
        pins.type === "sev-snp"
          ? ["launch"]
          : pins.type === "tdx"
            ? ["mrtd", "rtmr0", "rtmr1", "rtmr2", "rtmr3"]
            : [];
      if (
        !fields.length ||
        Object.entries(pins).some(
          ([key, value]) =>
            key !== "type" &&
            (!fields.includes(key) ||
              typeof value !== "string" ||
              !/^[0-9a-f]{96}$/.test(value)),
        )
      ) {
        throw privacyError("PRIVACY_CONFIGURATION_ERROR");
      }
    }
  } catch {
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
}

/** Fetch and independently verify nonce-bound V3 evidence before authorizing its transport key.
 * @param {TinfoilVerificationOptions} options - Request ownership, limits, trusted policy, and observers.
 * @returns {Promise<TinfoilVerification>} Immutable V3 facts with authenticated transport keys and expiry.
 */
export async function verifyTinfoilV3(
  options: TinfoilVerificationOptions,
): Promise<TinfoilVerification> {
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(options.limits.verificationTimeoutMs),
  ]);
  const nonce = randomBytes(32);
  const url = new URL(
    "https://inference.tinfoil.sh/.well-known/tinfoil-attestation",
  );
  url.searchParams.set("nonce", nonce.toString("hex"));
  const { bytes } = await fetchPrivacyBytes(
    url.toString(),
    { cache: "no-store" },
    {
      fetch: globalThis.fetch,
      signal,
      maxBytes: options.limits.maxEvidenceBytes,
      operation: "attestation",
      onDiagnostic: options.onDiagnostic,
      visibleQueryParams: new Set(["nonce"]),
    },
  );
  return tracePrivacyCheck(
    "workload-verification",
    { signal, onDiagnostic: options.onDiagnostic },
    async () => {
      try {
        const result = await awaitTinfoilOperation(
          () =>
            tinfoilVerifier.verify(bytes, {
              reference: options.reference ?? TINFOIL_CONFIG_REPOSITORY,
              freshnessMaxAgeMs: options.freshnessMaxAgeMs ?? 604800000,
              ...(options.pinnedRegisters
                ? { pinnedRegisters: options.pinnedRegisters }
                : {}),
              nonce,
              verificationTime: new Date(),
            }),
          signal,
        );
        assertPrivacyActive(signal);
        const expiry = result.freshnessExpiresAt?.getTime();
        if (
          !result.hpkePublicKey() ||
          !Number.isFinite(expiry) ||
          expiry! <= Date.now()
        ) {
          options.onFailure?.(
            !result.hpkePublicKey() ? "missing-hpke-key" : "expired-evidence",
          );
          throw privacyError("PRIVACY_ATTESTATION_FAILED");
        }
        return result;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "TinfoilVerificationError" &&
          "layer" in error &&
          typeof error.layer === "string"
        ) {
          const layer = ["envelope", "provenance", "quote", "policy"].includes(
            error.layer,
          )
            ? error.layer
            : "verification";
          options.onFailure?.(layer);
          throw privacyError("PRIVACY_ATTESTATION_FAILED");
        }
        const safeError = sanitizePrivacyError(error, signal);
        if (safeError.code === "PRIVACY_PROVIDER_ERROR") {
          options.onFailure?.("verification");
          throw privacyError("PRIVACY_ATTESTATION_FAILED");
        }
        throw safeError;
      }
    },
  );
}
