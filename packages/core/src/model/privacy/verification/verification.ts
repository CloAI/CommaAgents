import { intel, Quote, verify } from "@phala/dcap-qvl";
import type { Collateral } from "@phala/dcap-qvl";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { createLocalJWKSet, jwtVerify } from "jose";
import type { JSONWebKeySet, JWTPayload } from "jose";
import { z } from "zod";
import { privacyError } from "../privacy.utils";
import type {
  HardwareEvidence,
  NvidiaTokens,
  VerificationContext,
} from "./verification.types";
import {
  decodeHex,
  equalBytes,
  fetchVerificationResponse,
  sha256Bytes,
  verifierOrigin,
} from "./verification.utils";

const nvidiaEvidenceSchema = z.object({
  nonce: z.string().regex(/^[0-9a-f]{64}$/i),
  arch: z.string().min(1),
  evidence_list: z
    .array(
      z.object({
        certificate: z.string().min(1),
        evidence: z.string().min(1),
        arch: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(64),
});

const signedIntelObjectSchema = z
  .object({ signature: z.string().regex(/^[0-9a-f]+$/i) })
  .passthrough();
const jwksSchema = z.object({
  keys: z.array(z.object({ kty: z.string() }).passthrough()).min(1),
});

/** Verify CPU and GPU evidence, rejecting an unestablished link between the two.
 * @param {HardwareEvidence} evidence - Fresh hardware evidence and enclave key.
 * @param {VerificationContext} context - Trusted services, limits, and cancellation.
 * @returns {Promise<void>} Rejects when the aggregate hardware binding is unavailable.
 */
export async function verifyHardwareEvidence(
  evidence: HardwareEvidence,
  context: VerificationContext,
): Promise<void> {
  await verifyCpuEvidence(evidence, context);
  await verifyGpuEvidence(evidence, context);
  // Two genuine reports using the same challenge do not prove that the GPU
  // belongs to the CPU holding the encryption key. No supported Venice format
  // currently establishes that relationship independently.
  throw privacyError("PRIVACY_BINDING_UNAVAILABLE");
}

/** Independently authenticate Intel TDX evidence, key binding, and freshness.
 * @param {HardwareEvidence} evidence - Quote, enclave key, and caller challenge.
 * @param {VerificationContext} context - Trusted collateral service and request limits.
 * @returns {Promise<void>} Resolves only for an authenticated, up-to-date TDX quote.
 */
export async function verifyCpuEvidence(
  evidence: HardwareEvidence,
  context: VerificationContext,
): Promise<void> {
  context.signal.throwIfAborted();
  if (
    evidence.nonce.length !== 32 ||
    evidence.quote.length > context.maxEvidenceBytes ||
    evidence.signingPublicKey.length !== 65 ||
    evidence.signingPublicKey[0] !== 4
  )
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  secp256k1.Point.fromBytes(evidence.signingPublicKey);
  const quote = Quote.parse(evidence.quote);
  if (quote.header.teeType !== 0x81 || quote.header.isSgx())
    throw privacyError("PRIVACY_ATTESTATION_FAILED");

  const collateral = await fetchCollateral(quote, context);
  context.signal.throwIfAborted();
  // The package's public verify() uses its pinned Intel production root.
  const authenticated = verify(
    evidence.quote,
    collateral,
    Math.floor(Date.now() / 1000),
  );
  const report = authenticated.report.asTd10();
  if (
    authenticated.status !== "UpToDate" ||
    !report ||
    report.tdAttributes.length !== 8 ||
    (report.tdAttributes[0]! & 1) !== 0 ||
    report.reportData.length !== 64
  )
    throw privacyError("PRIVACY_ATTESTATION_FAILED");

  const address = keccak_256(evidence.signingPublicKey.subarray(1)).subarray(
    12,
  );
  const boundNonce = report.reportData.subarray(32, 64);
  if (
    !equalBytes(report.reportData.subarray(0, 20), address) ||
    (!equalBytes(boundNonce, evidence.nonce) &&
      !equalBytes(boundNonce, sha256Bytes(evidence.nonce)))
  )
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  context.signal.throwIfAborted();
}

/** Independently authenticate all NRAS token signatures and the GPU claims.
 * @param {HardwareEvidence} evidence - Fresh NVIDIA evidence and caller challenge.
 * @param {VerificationContext} context - Trusted NRAS endpoint and request limits.
 * @returns {Promise<void>} Resolves only when every reported GPU passes verification.
 */
export async function verifyGpuEvidence(
  evidence: HardwareEvidence,
  context: VerificationContext,
): Promise<void> {
  context.signal.throwIfAborted();
  if (
    typeof evidence.gpuEvidence === "string" &&
    Buffer.byteLength(evidence.gpuEvidence) > context.maxEvidenceBytes
  )
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  const rawPayload =
    typeof evidence.gpuEvidence === "string"
      ? (JSON.parse(evidence.gpuEvidence) as unknown)
      : evidence.gpuEvidence;
  const payload = nvidiaEvidenceSchema.parse(rawPayload);
  if (
    evidence.nonce.length !== 32 ||
    !equalBytes(decodeHex(payload.nonce), evidence.nonce)
  )
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  const issuer = verifierOrigin(context.nrasURL);
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > context.maxEvidenceBytes)
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  const response = await fetchVerificationResponse(context.nrasURL, context, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
  const tokens = parseNvidiaTokens(
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(response.bytes),
    ),
  );
  const keyResponse = await fetchVerificationResponse(
    `${issuer}/.well-known/jwks.json`,
    context,
  );
  const keySet = jwksSchema.parse(
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(keyResponse.bytes),
    ),
  ) as JSONWebKeySet;
  await verifyNvidiaTokens(
    tokens,
    evidence.nonce,
    keySet,
    issuer,
    payload.evidence_list.length,
  );
  context.signal.throwIfAborted();
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
  if (Object.keys(parsed[1]).length === 0)
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  return { overall: parsed[0][1], devices: parsed[1] };
}

/** Verify signed aggregate/device tokens and their exact digest relationships.
 * @param {NvidiaTokens} tokens - Detached-EAT tokens from NRAS.
 * @param {Uint8Array} nonce - Fresh expected challenge.
 * @param {JSONWebKeySet} keySet - Keys fetched from the configured NRAS issuer.
 * @param {string} issuer - Trusted issuer origin.
 * @param {number} deviceCount - Number of GPUs submitted for attestation.
 * @returns {Promise<void>} Resolves only for complete authenticated positive claims.
 */
export async function verifyNvidiaTokens(
  tokens: NvidiaTokens,
  nonce: Uint8Array,
  keySet: JSONWebKeySet,
  issuer: string,
  deviceCount: number,
): Promise<void> {
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
  )
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
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
  )
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  for (const [deviceId, token] of entries) {
    const digest = submodules[deviceId]?.[1][1];
    if (!digest || !equalBytes(decodeHex(digest), sha256Bytes(token)))
      throw privacyError("PRIVACY_ATTESTATION_FAILED");
    const { payload: device } = await jwtVerify(token, keys, options);
    assertNonceClaim(device, nonce);
    if (
      device.secboot !== true ||
      device.dbgstat !== "disabled" ||
      device.measres !== "success" ||
      typeof device.ueid !== "string" ||
      device.ueid.length === 0 ||
      device["x-nvidia-attestation-warning"] != null
    )
      throw privacyError("PRIVACY_ATTESTATION_FAILED");
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
      if (device[claim] !== true)
        throw privacyError("PRIVACY_ATTESTATION_FAILED");
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
      if (!Number.isFinite(expiration) || expiration <= Date.now())
        throw privacyError("PRIVACY_ATTESTATION_FAILED");
    }
  }
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
  )
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
}

/** Obtain collateral only from the runtime-selected PCCS using bounded reads.
 * @param {Quote} quote - Parsed Intel TDX quote.
 * @param {VerificationContext} context - Trusted collateral service and limits.
 * @returns {Promise<Collateral>} Collateral to authenticate against Intel's pinned root.
 */
async function fetchCollateral(
  quote: Quote,
  context: VerificationContext,
): Promise<Collateral> {
  // Embedded PCK chains avoid untrusted certificate URLs and encrypted-PPID lookups.
  quote.rawCertChain();
  const fmspc = Buffer.from(intel.getFmspc(quote)).toString("hex");
  const authority = intel.getCa(quote);
  if (
    !/^[0-9a-f]{12}$/.test(fmspc) ||
    !["processor", "platform"].includes(authority)
  )
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  const origin = verifierOrigin(context.pccsURL);
  const collateralAbort = new AbortController();
  const collateralContext = {
    ...context,
    signal: AbortSignal.any([context.signal, collateralAbort.signal]),
  };
  const [pck, tcb, identity, root] = await Promise.all([
    fetchVerificationResponse(
      `${origin}/sgx/certification/v4/pckcrl?ca=${authority}&encoding=der`,
      collateralContext,
    ),
    fetchVerificationResponse(
      `${origin}/tdx/certification/v4/tcb?fmspc=${fmspc}`,
      collateralContext,
    ),
    fetchVerificationResponse(
      `${origin}/tdx/certification/v4/qe/identity?update=standard`,
      collateralContext,
    ),
    fetchVerificationResponse(
      `${origin}/sgx/certification/v4/rootcacrl`,
      collateralContext,
    ),
  ]).finally(() => collateralAbort.abort());
  const tcbObject = signedIntelObjectSchema.parse(
    JSON.parse(Buffer.from(tcb.bytes).toString("utf8")),
  );
  const identityObject = signedIntelObjectSchema.parse(
    JSON.parse(Buffer.from(identity.bytes).toString("utf8")),
  );
  const tcbInfo = z.record(z.unknown()).parse(tcbObject.tcbInfo);
  const enclaveIdentity = z
    .record(z.unknown())
    .parse(identityObject.enclaveIdentity);
  const rootText = Buffer.from(root.bytes).toString("utf8").trim();
  const rootBytes = /^[0-9a-f]+$/i.test(rootText)
    ? decodeHex(rootText)
    : root.bytes;
  return {
    pck_crl_issuer_chain: certificateHeader(
      pck.response,
      ["SGX-PCK-CRL-Issuer-Chain"],
      context.maxEvidenceBytes,
    ),
    pck_crl: Array.from(pck.bytes),
    root_ca_crl: Array.from(rootBytes),
    tcb_info_issuer_chain: certificateHeader(
      tcb.response,
      ["SGX-TCB-Info-Issuer-Chain", "TCB-Info-Issuer-Chain"],
      context.maxEvidenceBytes,
    ),
    tcb_info: JSON.stringify(tcbInfo),
    tcb_info_signature: Array.from(decodeHex(tcbObject.signature)),
    qe_identity_issuer_chain: certificateHeader(
      identity.response,
      ["SGX-Enclave-Identity-Issuer-Chain"],
      context.maxEvidenceBytes,
    ),
    qe_identity: JSON.stringify(enclaveIdentity),
    qe_identity_signature: Array.from(decodeHex(identityObject.signature)),
  };
}

/** Decode a bounded issuer-chain header from an Intel collateral response.
 * @param {Response} response - Collateral response.
 * @param {readonly string[]} names - Supported issuer-chain header names.
 * @param {number} maxBytes - Header byte budget.
 * @returns {string} Decoded PEM chain.
 */
function certificateHeader(
  response: Response,
  names: readonly string[],
  maxBytes: number,
): string {
  const raw = names
    .map((name) => response.headers.get(name))
    .find((value) => value !== null);
  if (!raw || raw.length > maxBytes)
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  return decodeURIComponent(raw);
}
