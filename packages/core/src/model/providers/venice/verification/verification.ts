import {
  parseNvidiaTokens,
  verifyNvidiaTokens,
} from "../../../privacy/hardware/nvidia/nvidia";
export {
  parseNvidiaTokens,
  verifyNvidiaTokens,
} from "../../../privacy/hardware/nvidia/nvidia";
import {
  verifyWorkloadMeasurements,
  parseComposeManagerEvidence,
  verifyComposeManagerMeasurements,
  assertTrustedWorkload,
} from "./measurements";
import { intel, Quote, verify } from "@phala/dcap-qvl";
import type { Collateral, TDReport10 } from "@phala/dcap-qvl";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { JSONWebKeySet } from "jose";
import { z } from "zod";
import {
  privacyError,
  tracePrivacyCheck,
  observePrivacy,
} from "../../../privacy/privacy.utils";
import type {
  HardwareEvidence,
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

/** Verify hardware and software identity, then require an independently approved serving-stack policy.
 * @param {HardwareEvidence} evidence - Fresh hardware evidence and enclave key.
 * @param {VerificationContext} context - Trusted services, limits, and cancellation.
 * @returns {Promise<void>} Resolves only when hardware, software evidence, and approved policy all pass.
 */
export async function verifyHardwareEvidence(
  evidence: HardwareEvidence,
  context: VerificationContext,
): Promise<void> {
  const report = await tracePrivacyCheck("cpu-verification", context, () =>
    verifyCpuEvidence(evidence, context),
  );
  await tracePrivacyCheck("gpu-verification", context, () =>
    verifyGpuEvidence(evidence, context),
  );
  const measurements = await tracePrivacyCheck(
    "workload-measurements",
    context,
    async () => {
      const identity = verifyWorkloadMeasurements(evidence.workload, report);
      if (evidence.workload?.composeManager !== undefined) {
        const manager = parseComposeManagerEvidence(
          evidence.workload.composeManager,
        );
        const managerReport = await tracePrivacyCheck(
          "compose-manager-verification",
          context,
          () => verifyCpuQuote(decodeHex(manager.quote), context),
        );
        const composeManagerActionsHash = verifyComposeManagerMeasurements(
          manager,
          managerReport,
          report,
          evidence.nonce,
        );
        const authenticated = Object.freeze({
          ...identity,
          composeManagerActionsHash,
        });
        observePrivacy(() => context.onMeasurements?.(authenticated));
        return authenticated;
      }
      const authenticated = Object.freeze(identity);
      observePrivacy(() => context.onMeasurements?.(authenticated));
      return authenticated;
    },
  );
  await tracePrivacyCheck("workload-verification", context, async () => {
    assertTrustedWorkload(measurements, context.trustedWorkloads, (mismatch) =>
      observePrivacy(() => context.onWorkloadMismatch?.(mismatch)),
    );
  });
}

/** Independently authenticate Intel TDX evidence, key binding, and freshness.
 * @param {HardwareEvidence} evidence - Quote, enclave key, and caller challenge.
 * @param {VerificationContext} context - Trusted collateral service and request limits.
 * @returns {Promise<TDReport10>} Authenticated TDX report with a fresh nonce and declared key binding.
 */
export async function verifyCpuEvidence(
  evidence: HardwareEvidence,
  context: VerificationContext,
): Promise<TDReport10> {
  context.signal.throwIfAborted();
  if (
    evidence.nonce.length !== 32 ||
    evidence.quote.length > context.maxEvidenceBytes ||
    evidence.signingPublicKey.length !== 65 ||
    evidence.signingPublicKey[0] !== 4
  ) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
  secp256k1.Point.fromBytes(evidence.signingPublicKey);
  const report = await verifyCpuQuote(evidence.quote, context);

  const address = keccak_256(evidence.signingPublicKey.subarray(1)).subarray(
    12,
  );
  const boundNonce = report.reportData.subarray(32, 64);
  if (
    !equalBytes(report.reportData.subarray(0, 20), address) ||
    (!equalBytes(boundNonce, evidence.nonce) &&
      !equalBytes(boundNonce, sha256Bytes(evidence.nonce)))
  ) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
  context.signal.throwIfAborted();
  return report;
}

/** Authenticate a TDX quote and production TCB before using any report fields.
 * @param {Uint8Array} quoteBytes - Raw quote bytes.
 * @param {VerificationContext} context - Trusted collateral services and bounds.
 * @returns {Promise<TDReport10>} Hardware-authenticated TDX report.
 */
async function verifyCpuQuote(
  quoteBytes: Uint8Array,
  context: VerificationContext,
): Promise<TDReport10> {
  context.signal.throwIfAborted();
  if (quoteBytes.length > context.maxEvidenceBytes) {
    throw privacyError("PRIVACY_LIMIT_EXCEEDED");
  }
  const quote = Quote.parse(quoteBytes);
  if (quote.header.teeType !== 0x81 || quote.header.isSgx()) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }

  const collateral = await fetchCollateral(quote, context);
  context.signal.throwIfAborted();
  // The package's public verify() uses its pinned Intel production root.
  const authenticated = verify(
    quoteBytes,
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
  ) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }

  return report;
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
  ) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
  if (evidence.gpuEvidence === undefined || evidence.gpuEvidence === null) {
    throw privacyError("PRIVACY_GPU_EVIDENCE_UNAVAILABLE");
  }
  let rawPayload: unknown;
  try {
    rawPayload =
      typeof evidence.gpuEvidence === "string"
        ? (JSON.parse(evidence.gpuEvidence) as unknown)
        : evidence.gpuEvidence;
  } catch {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
  const parsedPayload = nvidiaEvidenceSchema.safeParse(rawPayload);
  if (!parsedPayload.success) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
  const payload = parsedPayload.data;
  if (
    evidence.nonce.length !== 32 ||
    !equalBytes(decodeHex(payload.nonce), evidence.nonce)
  ) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
  const issuer = verifierOrigin(context.nrasURL);
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > context.maxEvidenceBytes) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
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
  ) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
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
  if (!raw || raw.length > maxBytes) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
  return decodeURIComponent(raw);
}
