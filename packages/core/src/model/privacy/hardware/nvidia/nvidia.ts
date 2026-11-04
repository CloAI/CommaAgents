import { createHash, timingSafeEqual } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import type { JSONWebKeySet, JWTPayload } from "jose";
import { z } from "zod";
import { privacyError } from "../../privacy.utils";
import type { NvidiaTokens, NvidiaVerification } from "./nvidia.types";

/** Compare signed nonce and digest claims.
 * @param {Uint8Array} left - First authenticated claim.
 * @param {Uint8Array} right - Expected claim.
 * @returns {boolean} Whether both claims match.
 */
function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}
/** Decode exact signed hexadecimal claims.
 * @param {string} value - Encoded claim.
 * @returns {Uint8Array} Decoded claim.
 */
function decodeHex(value: string): Uint8Array {
  const text = value.replace(/^0x/, "");
  if (!/^(?:[0-9a-f]{2})+$/i.test(text)) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
  return Buffer.from(text, "hex");
}
/** Hash the signed submodule token.
 * @param {string} value - Exact compact JWT.
 * @returns {Uint8Array} Token digest.
 */
function sha256Bytes(value: string): Uint8Array {
  return createHash("sha256").update(value).digest();
}

/** Parse only the documented detached-EAT envelope; reject unrecognized shapes.
 * @param {unknown} payload - NRAS response.
 * @returns {NvidiaTokens} Overall token and signed per-device tokens.
 */
export function parseNvidiaTokens(payload: unknown): NvidiaTokens {
  const envelope = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "eat" in payload
      ? payload.eat
      : undefined;
  const parsed = z
    .tuple([
      z.tuple([z.literal("JWT"), z.string().min(1)]),
      z.record(z.string().min(1)),
    ])
    .parse(envelope);
  if (Object.keys(parsed[1]).length === 0) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
  return { overall: parsed[0][1], devices: parsed[1] };
}

/** Verify signed aggregate/device tokens and their exact digest relationships.
 * @param {NvidiaTokens} tokens - Detached-EAT tokens from NRAS.
 * @param {Uint8Array} nonce - Fresh expected challenge.
 * @param {JSONWebKeySet} keySet - Keys fetched from the configured NRAS issuer.
 * @param {string} issuer - Trusted issuer origin.
 * @param {number} deviceCount - Number of GPUs submitted for attestation.
 * @returns {Promise<NvidiaVerification>} Authenticated device identities and earliest token expiry.
 */
export async function verifyNvidiaTokens(
  tokens: NvidiaTokens,
  nonce: Uint8Array,
  keySet: JSONWebKeySet,
  issuer: string,
  deviceCount: number,
): Promise<NvidiaVerification> {
  const keys = createLocalJWKSet(keySet);
  const options = {
    algorithms: ["ES384"],
    issuer,
    requiredClaims: ["exp", "iat", "nbf", "iss", "eat_nonce"],
    maxTokenAge: 120,
    clockTolerance: 0,
  };
  const { payload: overall } = await jwtVerify(tokens.overall, keys, options);
  assertNonceClaim(overall, nonce);
  if (
    overall["x-nvidia-overall-att-result"] !== true ||
    overall.sub !== "NVIDIA-PLATFORM-ATTESTATION"
  ) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
  const submodules = z
    .record(
      z.tuple([
        z.literal("DIGEST"),
        z.tuple([z.literal("SHA-256"), z.string().regex(/^[0-9a-f]{64}$/i)]),
      ]),
    )
    .parse(overall.submods);
  const entries = Object.entries(tokens.devices);
  if (
    entries.length !== deviceCount ||
    Object.keys(submodules).length !== deviceCount
  ) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
  const deviceIds = new Set<string>();
  let expiresAt = overall.exp! * 1000;
  for (const [deviceId, token] of entries) {
    const digest = submodules[deviceId]?.[1][1];
    if (!digest || !equalBytes(decodeHex(digest), sha256Bytes(token))) {
      throw privacyError("PRIVACY_ATTESTATION_FAILED");
    }
    const { payload: device } = await jwtVerify(token, keys, options);
    assertNonceClaim(device, nonce);
    if (
      device.secboot !== true ||
      device.dbgstat !== "disabled" ||
      device.measres !== "success" ||
      typeof device.ueid !== "string" ||
      device.ueid.length === 0 ||
      deviceIds.has(device.ueid) ||
      device["x-nvidia-attestation-warning"] != null
    ) {
      throw privacyError("PRIVACY_ATTESTATION_FAILED");
    }
    deviceIds.add(device.ueid as string);
    expiresAt = Math.min(expiresAt, device.exp! * 1000);
    for (const claim of [
      "x-nvidia-gpu-attestation-report-signature-verified",
      "x-nvidia-gpu-attestation-report-nonce-match",
      "x-nvidia-gpu-attestation-report-parsed",
      "x-nvidia-gpu-driver-rim-signature-verified",
      "x-nvidia-gpu-vbios-rim-signature-verified",
      "x-nvidia-gpu-arch-check",
      "x-nvidia-gpu-driver-rim-schema-validated",
      "x-nvidia-gpu-vbios-rim-schema-validated",
      "x-nvidia-gpu-driver-rim-fetched",
      "x-nvidia-gpu-vbios-rim-fetched",
      "x-nvidia-gpu-driver-rim-version-match",
      "x-nvidia-gpu-vbios-rim-version-match",
      "x-nvidia-gpu-driver-rim-measurements-available",
      "x-nvidia-gpu-vbios-rim-measurements-available",
      "x-nvidia-gpu-vbios-index-no-conflict",
      "x-nvidia-gpu-attestation-report-cert-chain-fwid-match",
    ]) {
      if (device[claim] !== true) {
        throw privacyError("PRIVACY_ATTESTATION_FAILED");
      }
    }
    for (const claim of [
      "x-nvidia-gpu-attestation-report-cert-chain",
      "x-nvidia-gpu-driver-rim-cert-chain",
      "x-nvidia-gpu-vbios-rim-cert-chain",
    ]) {
      const chain = z
        .object({
          "x-nvidia-cert-status": z.literal("valid"),
          "x-nvidia-cert-ocsp-status": z.literal("good"),
          "x-nvidia-cert-expiration-date": z.string(),
        })
        .parse(device[claim]);
      const expiration = Date.parse(chain["x-nvidia-cert-expiration-date"]);
      if (!Number.isFinite(expiration) || expiration <= Date.now()) {
        throw privacyError("PRIVACY_ATTESTATION_FAILED");
      }
    }
  }
  return { expiresAt, deviceIds: [...deviceIds] };
}

/** Require a signed freshness claim rather than a provider's echoed nonce.
 * @param {JWTPayload} payload - Authenticated claims.
 * @param {Uint8Array} expectedNonce - Fresh expected challenge.
 * @returns {void} Throws for missing or mismatching signed freshness.
 */
function assertNonceClaim(
  payload: JWTPayload,
  expectedNonce: Uint8Array,
): void {
  if (
    typeof payload.eat_nonce !== "string" ||
    !equalBytes(decodeHex(payload.eat_nonce), expectedNonce)
  ) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
}
